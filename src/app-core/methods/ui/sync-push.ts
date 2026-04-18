import {
    getScopedPresetsStorageKey,
    getSalesStorageKey as getScopedSalesStorageKey
} from "../../storageKeys.ts";
import type { SyncPushResponseBody } from "./sync-network.ts";
import type { SyncApp, SyncPushOptions, SyncScopeContext, SyncServiceDeps } from "./sync-service.ts";

const STORAGE_RESET_RECOVERY_COOLDOWN_MS = 30_000;

type SyncRecoveryState = {
  __syncStorageResetRecoveryAtMs?: number;
};

export function isLocalSyncCacheReset(app: SyncApp, deps: SyncServiceDeps, scope: SyncScopeContext): boolean {
  if (!app.lastSyncedPayloadHash) return false;
  if (!Array.isArray(app.lots) || app.lots.length === 0) return false;

  try {
    if (deps.hasStorageItem(scope, getScopedPresetsStorageKey(scope))) return false;

    const hasAnyInMemorySales = Array.isArray(app.sales) && app.sales.length > 0;
    const hasAnyPersistedSales = app.lots.some((lot) => deps.hasStorageItem(scope, getScopedSalesStorageKey(lot.id, scope)));
    return hasAnyInMemorySales || !hasAnyPersistedSales;
  } catch {
    return false;
  }
}

export function shouldAttemptStorageResetRecovery(app: SyncApp, deps: SyncServiceDeps): boolean {
  const state = app as SyncApp & SyncRecoveryState;
  const nowMs = deps.now();
  const lastAttemptMs = Number(state.__syncStorageResetRecoveryAtMs ?? 0);
  if (Number.isFinite(lastAttemptMs) && lastAttemptMs > 0 && nowMs - lastAttemptMs < STORAGE_RESET_RECOVERY_COOLDOWN_MS) {
    return false;
  }
  state.__syncStorageResetRecoveryAtMs = nowMs;
  return true;
}

export async function performCloudSyncPush(
  app: SyncApp,
  force = false,
  resolvedDeps: SyncServiceDeps,
  scope: SyncScopeContext,
  options: SyncPushOptions = {}
): Promise<void> {
  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) return;
  if (!resolvedDeps.isOnline()) {
    app.isOffline = true;
    app.startOfflineReconnectScheduler();
    return;
  }

  if (isLocalSyncCacheReset(app, resolvedDeps, scope)) {
    console.warn("[whatfees] Cloud sync push skipped: local cache reset detected, pulling first");
    if (shouldAttemptStorageResetRecovery(app, resolvedDeps)) {
      void app.pullCloudSync();
    }
    return;
  }

  const clientVersion = resolvedDeps.getStoredClientVersion(scope);
  const syncPayload = resolvedDeps.createSyncPayload(app, clientVersion, scope);
  if (options.allowEmptyOverwrite === true) {
    syncPayload.allowEmptyOverwrite = true;
  }
  const payloadSignature = resolvedDeps.getSyncPayloadSignature(syncPayload);
  if (!force && app.lastSyncedPayloadHash === payloadSignature) {
    return;
  }
  resolvedDeps.startSyncStatus(app);

  try {
    const response = await resolvedDeps.requestCloudSyncPush(base, syncPayload, "session-preferred");

    if (response.status === 401) {
      resolvedDeps.handleExpiredAuth(app);
      if (typeof app.stopCloudSyncScheduler === "function") {
        app.stopCloudSyncScheduler();
      }
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync skipped: auth expired");
      return;
    }
    if (response.status === 403 && app.activeScopeType === "workspace") {
      resolvedDeps.setSyncStatusError(app);
      await app.handleWorkspaceAccessLost(app.activeWorkspaceId ?? undefined);
      return;
    }
    if (response.status === 409) {
      if (options.treatConflictAsSuccess === true) {
        resolvedDeps.setSyncStatusSuccess(app);
        console.warn("[whatfees] Cloud sync push conflict ignored for scoped seed");
        return;
      }
      resolvedDeps.setSyncStatusError(app);
      void app.pullCloudSync();
      app.notify("Cloud data changed. Pulled latest data. Please retry your change.", "warning");
      console.warn("[whatfees] Cloud sync push conflict: pulled latest snapshot");
      return;
    }

    if (!response.ok) {
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPushResponseBody;
    const serverVersion = Number(body.version);
    if (Number.isFinite(serverVersion)) {
      resolvedDeps.setStoredClientVersion(scope, serverVersion);
    }
    app.lastSyncedPayloadHash = payloadSignature;
    resolvedDeps.setStoredLastSyncedPayloadHash(scope, payloadSignature);
    resolvedDeps.setSyncStatusSuccess(app);
    console.info("[whatfees] Cloud sync pushed");
  } catch (error) {
    if (!resolvedDeps.isOnline()) {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    }
    resolvedDeps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync push error", error);
  }
}
