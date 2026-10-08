import type { SyncServiceContext } from "../../../context/sync.ts";
import type { SyncPushOptions } from "./sync-service.ts";
import type { SyncServiceDeps } from "./sync-service.ts";
import type { SyncScopeContext } from "./sync-scope.ts";
import type { PersistenceOutcome } from "../../../shared/persistence-outcomes.ts";

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
}: SyncPushConflictPolicyArgs): Promise<PersistenceOutcome> {
  if (options.treatConflictAsSuccess === true) {
    deps.setSyncStatusSuccess(app);
    console.warn("[whatfees] Cloud sync push conflict ignored for scoped seed");
    return { kind: "conflict", latestState: "unavailable" };
  }

  const lastSyncedPayloadHash = String(app.lastSyncedPayloadHash || "");
  if (lastSyncedPayloadHash && lastSyncedPayloadHash === attemptedPayloadSignature) {
    console.info("[whatfees] Cloud sync push conflict: pulling latest clean state");
    const pullOutcome = await app.pullCloudSync();
    return pullOutcome.kind === "confirmed"
      ? { kind: "confirmed", persistence: "cloud", cache: pullOutcome.cache, cloud: "confirmed" }
      : { kind: "conflict", latestState: "unavailable" };
  }

  deps.setSyncStatusError(app);
  app.notify("Cloud data changed. Your local changes were kept. Pull latest data before retrying.", "warning");
  console.warn("[whatfees] Cloud sync push conflict: kept local edits for manual recovery");
  return { kind: "conflict", latestState: "unavailable" };
}
