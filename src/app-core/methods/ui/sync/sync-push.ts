import type { SyncPushResponseBody } from "./sync-network.ts";
import type { SyncPushOptions } from "./sync-service.ts";
import type { SyncSession } from "./sync-session.ts";
import { recoverFromLocalSyncCacheReset } from "./sync-storage-reset-recovery.ts";
import { getLocalSalesSignature } from "./sync-local-sales.ts";
import type { PersistenceOutcome } from "../../../shared/persistence-outcomes.ts";
import { forgetSyncPush, recoverSyncPushAcknowledgement, rememberSyncPush } from "./sync-push-acknowledgement.ts";

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

  const recovery = recoverSyncPushAcknowledgement(session);
  if (recovery) {
    const recoveryOutcome = await recovery;
    if (recoveryOutcome) return recoveryOutcome;
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
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
  const localSalesSignature = getLocalSalesSignature(app);
  deps.startSyncStatus(app);

  let releaseAttempt: (() => void) | undefined;
  try {
    releaseAttempt = rememberSyncPush(session, clientVersion, payloadSignature);
    const response = await session.requestPush(syncPayload);
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    // A timeout or server/gateway failure can arrive after the write committed.
    if (!response.ok && response.status < 500 && response.status !== 408) forgetSyncPush(session);

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
        session,
        options,
        attemptedPayloadSignature: payloadSignature,
        isLocalSalesCurrent: () => getLocalSalesSignature(app) === localSalesSignature
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
    const serverVersion = body.version;
    if (typeof serverVersion !== "number" || !Number.isSafeInteger(serverVersion) || serverVersion < clientVersion) {
      throw new Error("Cloud sync response did not acknowledge a valid version.");
    }
    session.setStoredClientVersion(serverVersion);
    session.setLastSyncedPayloadHash(payloadSignature);
    forgetSyncPush(session);
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
  } finally {
    releaseAttempt?.();
  }
}
