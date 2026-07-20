import type { SyncServiceContext } from "../../../context/sync.ts";
import type { SyncPushOptions } from "./sync-service.ts";
import type { SyncServiceDeps } from "./sync-service.ts";
import type { SyncScopeContext } from "./sync-scope.ts";

export type SyncPushConflictPolicyArgs = {
  app: SyncServiceContext;
  deps: SyncServiceDeps;
  scope: SyncScopeContext;
  options: SyncPushOptions;
  attemptedPayloadSignature: string;
};

export async function handleSyncPushConflict({
  app,
  deps,
  options,
  attemptedPayloadSignature
}: SyncPushConflictPolicyArgs): Promise<void> {
  if (options.treatConflictAsSuccess === true) {
    deps.setSyncStatusSuccess(app);
    console.warn("[whatfees] Cloud sync push conflict ignored for scoped seed");
    return;
  }

  const lastSyncedPayloadHash = String(app.lastSyncedPayloadHash || "");
  if (lastSyncedPayloadHash && lastSyncedPayloadHash === attemptedPayloadSignature) {
    console.info("[whatfees] Cloud sync push conflict: pulling latest clean state");
    await app.pullCloudSync();
    return;
  }

  deps.setSyncStatusError(app);
  app.notify("Cloud data changed. Your local changes were kept. Pull latest data before retrying.", "warning");
  console.warn("[whatfees] Cloud sync push conflict: kept local edits for manual recovery");
}
