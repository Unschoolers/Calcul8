import type { AppContext } from "../../context-app.ts";
export type SyncStatusApp = Pick<AppContext, "syncStatus" | "syncStatusResetTimeoutId">;

export function startSyncStatus(context: SyncStatusApp): void {
  context.syncStatus = "syncing";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

export function setSyncStatusSuccess(context: SyncStatusApp): void {
  context.syncStatus = "success";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

export function setSyncStatusError(context: SyncStatusApp): void {
  context.syncStatus = "error";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

