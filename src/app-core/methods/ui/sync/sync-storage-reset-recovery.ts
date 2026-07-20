import {
  getScopedPresetsStorageKey,
  getSalesStorageKey as getScopedSalesStorageKey
} from "../../../storageKeys.ts";
import type { SyncSession } from "./sync-session.ts";
import type { SyncServiceContext } from "../../../context/sync.ts";
import type { SyncServiceDeps } from "./sync-service.ts";
import type { SyncScopeContext } from "./sync-scope.ts";
import { hasStorageReadFailure } from "../../../storage-health.ts";

const STORAGE_RESET_RECOVERY_COOLDOWN_MS = 30_000;

type SyncRecoveryState = {
  __syncStorageResetRecoveryAtMs?: number;
};

export function isLocalSyncCacheReset(app: SyncServiceContext, deps: SyncServiceDeps, scope: SyncScopeContext): boolean {
  if (hasStorageReadFailure(app, scope)) return true;
  if (!app.lastSyncedPayloadHash) return false;
  if (!Array.isArray(app.lots) || app.lots.length === 0) return false;

  try {
    if (deps.hasStorageItem(scope, getScopedPresetsStorageKey(scope))) return false;

    const hasAnyInMemorySales = Array.isArray(app.sales) && app.sales.length > 0;
    const hasAnyPersistedSales = app.lots.some((lot) => deps.hasStorageItem(scope, getScopedSalesStorageKey(lot.id, scope)));
    return hasAnyInMemorySales || !hasAnyPersistedSales;
  } catch {
    return false;
  }
}

export function shouldAttemptStorageResetRecovery(app: SyncServiceContext, deps: SyncServiceDeps): boolean {
  const state = app as SyncServiceContext & SyncRecoveryState;
  const nowMs = deps.now();
  const lastAttemptMs = Number(state.__syncStorageResetRecoveryAtMs ?? 0);
  if (Number.isFinite(lastAttemptMs) && lastAttemptMs > 0 && nowMs - lastAttemptMs < STORAGE_RESET_RECOVERY_COOLDOWN_MS) {
    return false;
  }
  state.__syncStorageResetRecoveryAtMs = nowMs;
  return true;
}

export function recoverFromLocalSyncCacheReset(
  session: SyncSession
): boolean {
  const { app, deps, scope } = session;
  if (!isLocalSyncCacheReset(app, deps, scope)) {
    return false;
  }

  console.warn("[whatfees] Cloud sync push skipped: local cache reset detected, pulling first");
  if (shouldAttemptStorageResetRecovery(app, deps)) {
    void app.pullCloudSync();
  }
  return true;
}
