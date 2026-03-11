import type { AppContext } from "../../context.ts";
import { SYNC_STATUS_RESET_MS } from "./shared.ts";

export type SyncStatusApp = Pick<AppContext, "syncStatus" | "syncStatusResetTimeoutId">;

function scheduleResetToIdle(context: SyncStatusApp): void {
  context.syncStatusResetTimeoutId = window.setTimeout(() => {
    context.syncStatus = "idle";
    context.syncStatusResetTimeoutId = null;
  }, SYNC_STATUS_RESET_MS);
}

export function startSyncStatus(context: SyncStatusApp): void {
  context.syncStatus = "syncing";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

export function setSyncStatusSuccess(context: SyncStatusApp): void {
  context.syncStatus = "success";
  scheduleResetToIdle(context);
}

export function setSyncStatusError(context: SyncStatusApp): void {
  context.syncStatus = "error";
  scheduleResetToIdle(context);
}
