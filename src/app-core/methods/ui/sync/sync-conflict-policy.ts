import type { SyncApp, SyncPushOptions } from "./sync-service.ts";
import type { SyncServiceDeps } from "./sync-service.ts";
import type { SyncScopeContext } from "./sync-scope.ts";

export type SyncPushConflictPolicyArgs = {
  app: SyncApp;
  deps: SyncServiceDeps;
  scope: SyncScopeContext;
  options: SyncPushOptions;
};

export async function handleSyncPushConflict({
  app,
  deps,
  options
}: SyncPushConflictPolicyArgs): Promise<void> {
  if (options.treatConflictAsSuccess === true) {
    deps.setSyncStatusSuccess(app);
    console.warn("[whatfees] Cloud sync push conflict ignored for scoped seed");
    return;
  }

  deps.setSyncStatusError(app);
  try {
    await app.pullCloudSync();
    app.notify("Cloud data changed. Pulled latest data. Please retry your change.", "warning");
    console.warn("[whatfees] Cloud sync push conflict: pulled latest snapshot");
  } catch (error) {
    app.notify("Cloud data changed. Pull latest data before retrying your change.", "warning");
    console.warn("[whatfees] Cloud sync push conflict recovery failed", error);
  }
}
