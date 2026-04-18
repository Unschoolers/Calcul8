import type { SyncPullResponseBody } from "./sync-network.ts";
import type { SyncApp, SyncPullOptions, SyncScopeContext, SyncServiceDeps } from "./sync-service.ts";

export async function performCloudSyncPull(
  app: SyncApp,
  resolvedDeps: SyncServiceDeps,
  scope: SyncScopeContext,
  options: SyncPullOptions = {}
): Promise<void> {
  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) return;
  if (!resolvedDeps.isOnline()) {
    app.isOffline = true;
    app.startOfflineReconnectScheduler();
    return;
  }

  resolvedDeps.startSyncStatus(app);

  try {
    const response = await resolvedDeps.requestCloudSyncPull(
      base,
      scope.scopeType === "workspace" ? scope.workspaceId ?? undefined : undefined,
      "session-preferred"
    );

    if (response.status === 401) {
      resolvedDeps.handleExpiredAuth(app);
      resolvedDeps.setSyncStatusError(app);
      return;
    }
    if (response.status === 403 && app.activeScopeType === "workspace") {
      resolvedDeps.setSyncStatusError(app);
      await app.handleWorkspaceAccessLost(app.activeWorkspaceId ?? undefined);
      return;
    }
    if (!response.ok) {
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync pull failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPullResponseBody;
    if (!body.snapshot) {
      const signature = resolvedDeps.getSyncPayloadSignature(resolvedDeps.createSyncPayload(app, undefined, scope));
      app.lastSyncedPayloadHash = signature;
      resolvedDeps.setStoredLastSyncedPayloadHash(scope, signature);
      resolvedDeps.setSyncStatusSuccess(app);
      return;
    }

    const parsedSnapshot = resolvedDeps.parseCloudSnapshot(body.snapshot);
    const localHasSales = app.lots.some((lot) => app.loadSalesForLotId(lot.id).length > 0);
    const localHasWheelConfigs = Array.isArray(app.wheelConfigs) && app.wheelConfigs.length > 0;
    const localHasData = app.lots.length > 0 || localHasSales || localHasWheelConfigs;
    const localVersion = resolvedDeps.getStoredClientVersion(scope);
    const shouldApplyCloud = options.forceApply === true
      ? true
      : resolvedDeps.shouldApplyCloudSnapshot({
        cloudVersion: parsedSnapshot.version,
        localVersion,
        localHasData,
        cloudHasData: parsedSnapshot.hasData
      });
    if (!shouldApplyCloud) {
      const signature = resolvedDeps.getSyncPayloadSignature(resolvedDeps.createSyncPayload(app, undefined, scope));
      app.lastSyncedPayloadHash = signature;
      resolvedDeps.setStoredLastSyncedPayloadHash(scope, signature);
      resolvedDeps.setSyncStatusSuccess(app);
      return;
    }

    resolvedDeps.applyCloudSnapshotToLocal(app, parsedSnapshot);
    const signature = resolvedDeps.getSyncPayloadSignature(resolvedDeps.createSyncPayload(app, undefined, scope));
    app.lastSyncedPayloadHash = signature;
    resolvedDeps.setStoredLastSyncedPayloadHash(scope, signature);
    resolvedDeps.setSyncStatusSuccess(app);
    app.notify("Cloud data synced", "success");
    console.info("[whatfees] Cloud sync pulled", { version: parsedSnapshot.version });
  } catch (error) {
    if (!resolvedDeps.isOnline()) {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    }
    resolvedDeps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync pull error", error);
  }
}
