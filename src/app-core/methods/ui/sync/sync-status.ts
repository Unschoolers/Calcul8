import type { SyncStatusContext } from "../../../context/sync.ts";

export function startSyncStatus(context: SyncStatusContext): void {
  context.syncStatus = "syncing";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

export function setSyncStatusSuccess(context: SyncStatusContext): void {
  context.syncStatus = "success";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

export function setSyncStatusError(context: SyncStatusContext): void {
  context.syncStatus = "error";
  if (context.syncStatusResetTimeoutId != null) {
    window.clearTimeout(context.syncStatusResetTimeoutId);
    context.syncStatusResetTimeoutId = null;
  }
}

