import type { SyncPullResponseBody } from "./sync-network.ts";
import type { SyncPullOptions } from "./sync-service.ts";
import type { SyncSession } from "./sync-session.ts";
import type { PersistenceOutcome } from "../../../shared/persistence-outcomes.ts";
import { recoverSyncPushAcknowledgement } from "./sync-push-acknowledgement.ts";

export async function performCloudSyncPull(
  session: SyncSession,
  options: SyncPullOptions = {}
): Promise<PersistenceOutcome> {
  const { app, deps, scope, baseUrl } = session;
  let cloudSnapshotReceived = false;
  const isCurrentRequest = () => session.isCurrentScope() && options.isRequestCurrent?.() !== false;
  const staleRequestOutcome = (): PersistenceOutcome => {
    if (session.isCurrentScope() && options.expectedPayloadSignature) {
      deps.setSyncStatusError(app);
      return { kind: "conflict", latestState: "unavailable" };
    }
    return { kind: "skipped", reason: "stale-scope" };
  };
  if (!isCurrentRequest()) return staleRequestOutcome();
  if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
  if (!baseUrl) return { kind: "skipped", reason: "unavailable" };
  if (!deps.isOnline()) {
    session.markOffline();
    return { kind: "skipped", reason: "offline" };
  }

  if (options.forceApply !== true) {
    const recovery = recoverSyncPushAcknowledgement(session);
    if (recovery) {
      const outcome = await recovery;
      if (outcome) return outcome;
      if (!isCurrentRequest()) return staleRequestOutcome();
    }
  }

  deps.startSyncStatus(app);

  const localEditsConflict = (): PersistenceOutcome => {
    deps.setSyncStatusError(app);
    app.notify("Cloud data changed. Your local changes were kept. Pull latest data before retrying.", "warning");
    console.warn("[whatfees] Cloud sync pull recovery: local edits changed during clean conflict recovery");
    return { kind: "conflict", latestState: "unavailable" };
  };

  if (options.expectedPayloadSignature
      && session.getCurrentPayloadSignature() !== options.expectedPayloadSignature) {
    return localEditsConflict();
  }

  try {
    const response = await session.requestPull();
    if (!isCurrentRequest()) return staleRequestOutcome();
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };

    if (response.status === 401) {
      deps.handleExpiredAuth(app);
      deps.setSyncStatusError(app);
      return { kind: "skipped", reason: "auth" };
    }
    if (response.status === 403 && scope.scopeType === "workspace") {
      deps.setSyncStatusError(app);
      await session.handleWorkspaceAccessLost();
      return { kind: "failure", error: new Error("Workspace access was lost."), stage: "sync", status: 403 };
    }
    if (!response.ok) {
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync pull failed", {
        status: response.status,
        statusText: response.statusText
      });
      return { kind: "failure", error: new Error(`Cloud sync pull failed: ${response.statusText}`), stage: "sync", status: response.status };
    }

    if (options.expectedPayloadSignature
        && session.getCurrentPayloadSignature() !== options.expectedPayloadSignature) {
      return localEditsConflict();
    }

    const body = (await response.json()) as SyncPullResponseBody;
    if (!isCurrentRequest()) return staleRequestOutcome();
    cloudSnapshotReceived = true;
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    if (options.expectedPayloadSignature
        && session.getCurrentPayloadSignature() !== options.expectedPayloadSignature) {
      return localEditsConflict();
    }
    if (!body.snapshot) {
      deps.setSyncStatusSuccess(app);
      return { kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" };
    }

    const parsedSnapshot = deps.parseCloudSnapshot(body.snapshot);
    const localHasSales = app.lots.some((lot) => app.loadSalesForLotId(lot.id).length > 0);
    const localHasWheelConfigs = Array.isArray(app.wheelConfigs) && app.wheelConfigs.length > 0;
    const localHasData = app.lots.length > 0 || localHasSales || localHasWheelConfigs;
    const localVersion = session.getStoredClientVersion();
    const shouldApplyCloud = options.forceApply === true
      ? true
      : deps.shouldApplyCloudSnapshot({
        cloudVersion: parsedSnapshot.version,
        localVersion,
        localHasData,
        cloudHasData: parsedSnapshot.hasData
      });
    if (!shouldApplyCloud) {
      deps.setSyncStatusSuccess(app);
      return { kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" };
    }

    if (options.expectedPayloadSignature
        && session.getCurrentPayloadSignature() !== options.expectedPayloadSignature) {
      return localEditsConflict();
    }

    if (!isCurrentRequest()) return staleRequestOutcome();
    deps.applyCloudSnapshotToLocal(app, parsedSnapshot);
    const signature = session.getCurrentPayloadSignature();
    session.setLastSyncedPayloadHash(signature);
    deps.setSyncStatusSuccess(app);
    app.notify("Cloud data synced", "success");
    console.info("[whatfees] Cloud sync pulled", { version: parsedSnapshot.version });
    return { kind: "confirmed", persistence: "cloud", cache: "saved", cloud: "confirmed" };
  } catch (error) {
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    if (!deps.isOnline()) {
      session.markOffline();
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync pull skipped while offline", error);
      return { kind: "skipped", reason: "offline" };
    }
    deps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync pull error", error);
    return {
      kind: "failure",
      error,
      stage: cloudSnapshotReceived ? "cache" : "sync",
      ...(cloudSnapshotReceived ? { cloudConfirmed: true as const } : {})
    };
  }
}
