import type { SyncPullResponseBody } from "./sync-network.ts";
import type { SyncPullOptions } from "./sync-service.ts";
import type { SyncSession } from "./sync-session.ts";

export async function performCloudSyncPull(
  session: SyncSession,
  options: SyncPullOptions = {}
): Promise<void> {
  const { app, deps, scope, baseUrl } = session;
  if (!baseUrl) return;
  if (!deps.isOnline()) {
    session.markOffline();
    return;
  }

  deps.startSyncStatus(app);

  try {
    const response = await session.requestPull();

    if (response.status === 401) {
      deps.handleExpiredAuth(app);
      deps.setSyncStatusError(app);
      return;
    }
    if (response.status === 403 && scope.scopeType === "workspace") {
      deps.setSyncStatusError(app);
      await session.handleWorkspaceAccessLost();
      return;
    }
    if (!response.ok) {
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync pull failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPullResponseBody;
    if (!body.snapshot) {
      const signature = session.getCurrentPayloadSignature();
      session.setLastSyncedPayloadHash(signature);
      deps.setSyncStatusSuccess(app);
      return;
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
      const signature = session.getCurrentPayloadSignature();
      session.setLastSyncedPayloadHash(signature);
      deps.setSyncStatusSuccess(app);
      return;
    }

    deps.applyCloudSnapshotToLocal(app, parsedSnapshot);
    const signature = session.getCurrentPayloadSignature();
    session.setLastSyncedPayloadHash(signature);
    deps.setSyncStatusSuccess(app);
    app.notify("Cloud data synced", "success");
    console.info("[whatfees] Cloud sync pulled", { version: parsedSnapshot.version });
  } catch (error) {
    if (!deps.isOnline()) {
      session.markOffline();
    }
    deps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync pull error", error);
  }
}
