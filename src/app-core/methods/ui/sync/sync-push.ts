import type { SyncPushResponseBody } from "./sync-network.ts";
import type { SyncPushOptions } from "./sync-service.ts";
import type { SyncSession } from "./sync-session.ts";
import { recoverFromLocalSyncCacheReset } from "./sync-storage-reset-recovery.ts";

export async function performCloudSyncPush(
  session: SyncSession,
  force = false,
  options: SyncPushOptions = {}
): Promise<void> {
  const { app, deps, scope, baseUrl } = session;
  if (!baseUrl) return;
  if (!deps.isOnline()) {
    session.markOffline();
    return;
  }

  if (recoverFromLocalSyncCacheReset(session)) {
    return;
  }

  const clientVersion = session.getStoredClientVersion();
  const syncPayload = session.createPayload(clientVersion);
  if (options.allowEmptyOverwrite === true) {
    syncPayload.allowEmptyOverwrite = true;
  }
  const payloadSignature = session.getPayloadSignature(syncPayload);
  if (!force && app.lastSyncedPayloadHash === payloadSignature) {
    return;
  }
  deps.startSyncStatus(app);

  try {
    const response = await session.requestPush(syncPayload);

    if (response.status === 401) {
      deps.handleExpiredAuth(app);
      if (typeof app.stopCloudSyncScheduler === "function") {
        app.stopCloudSyncScheduler();
      }
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync skipped: auth expired");
      return;
    }
    if (response.status === 403 && scope.scopeType === "workspace") {
      deps.setSyncStatusError(app);
      await session.handleWorkspaceAccessLost();
      return;
    }
    if (response.status === 409) {
      await deps.handlePushConflict({
        app,
        deps,
        scope,
        options
      });
      return;
    }

    if (!response.ok) {
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPushResponseBody;
    const serverVersion = Number(body.version);
    if (Number.isFinite(serverVersion)) {
      session.setStoredClientVersion(serverVersion);
    }
    session.setLastSyncedPayloadHash(payloadSignature);
    deps.setSyncStatusSuccess(app);
    console.info("[whatfees] Cloud sync pushed");
  } catch (error) {
    if (!deps.isOnline()) {
      session.markOffline();
    }
    deps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync push error", error);
  }
}
