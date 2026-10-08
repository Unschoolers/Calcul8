import type { SyncPushResponseBody } from "./sync-network.ts";
import type { SyncPushOptions } from "./sync-service.ts";
import type { SyncSession } from "./sync-session.ts";
import { recoverFromLocalSyncCacheReset } from "./sync-storage-reset-recovery.ts";
import type { PersistenceOutcome } from "../../../shared/persistence-outcomes.ts";

export async function performCloudSyncPush(
  session: SyncSession,
  force = false,
  options: SyncPushOptions = {}
): Promise<PersistenceOutcome> {
  const { app, deps, scope, baseUrl } = session;
  let cloudWriteConfirmed = false;
  if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
  if (!baseUrl) return { kind: "skipped", reason: "unavailable" };
  if (!deps.isOnline()) {
    session.markOffline();
    return { kind: "skipped", reason: "offline" };
  }

  if (recoverFromLocalSyncCacheReset(session)) {
    return { kind: "skipped", reason: "not-ready" };
  }

  const clientVersion = session.getStoredClientVersion();
  const syncPayload = session.createPayload(clientVersion);
  if (options.allowEmptyOverwrite === true) {
    syncPayload.allowEmptyOverwrite = true;
  }
  const payloadSignature = session.getPayloadSignature(syncPayload);
  if (!force && app.lastSyncedPayloadHash === payloadSignature) {
    return { kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" };
  }
  deps.startSyncStatus(app);

  try {
    const response = await session.requestPush(syncPayload);
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };

    if (response.status === 401) {
      deps.handleExpiredAuth(app);
      if (typeof app.stopCloudSyncScheduler === "function") {
        app.stopCloudSyncScheduler();
      }
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync skipped: auth expired");
      return { kind: "skipped", reason: "auth" };
    }
    if (response.status === 403 && scope.scopeType === "workspace") {
      deps.setSyncStatusError(app);
      await session.handleWorkspaceAccessLost();
      return { kind: "failure", error: new Error("Workspace access was lost."), stage: "sync", status: 403 };
    }
    if (response.status === 409) {
      return await deps.handlePushConflict({
        app,
        deps,
        scope,
        options,
        attemptedPayloadSignature: payloadSignature
      });
    }

    if (!response.ok) {
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push failed", {
        status: response.status,
        statusText: response.statusText
      });
      return { kind: "failure", error: new Error(`Cloud sync push failed: ${response.statusText}`), stage: "sync", status: response.status };
    }

    cloudWriteConfirmed = true;
    const body = (await response.json()) as SyncPushResponseBody;
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    const serverVersion = Number(body.version);
    if (Number.isFinite(serverVersion)) {
      session.setStoredClientVersion(serverVersion);
    }
    session.setLastSyncedPayloadHash(payloadSignature);
    deps.setSyncStatusSuccess(app);
    console.info("[whatfees] Cloud sync pushed");
    return { kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" };
  } catch (error) {
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    if (!deps.isOnline()) {
      session.markOffline();
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push skipped while offline", error);
      return { kind: "skipped", reason: "offline" };
    }
    deps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync push error", error);
    return {
      kind: "failure",
      error,
      stage: cloudWriteConfirmed ? "cache" : "sync",
      ...(cloudWriteConfirmed ? { cloudConfirmed: true as const } : {})
    };
  }
}
