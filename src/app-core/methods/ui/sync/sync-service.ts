import type { AppContext } from "../../../context-app.ts";
import {
  getScopedLastSyncedPayloadHashKey,
  getScopedSyncClientVersionKey,
  type AppStorageScope
} from "../../../storageKeys.ts";
import {
  CLOUD_SYNC_INTERVAL_MS,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "../common/shared.ts";
import {
  applyCloudSnapshotToLocal,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  type ParsedCloudSnapshot
} from "./sync-apply.ts";
import { handleSyncPushConflict } from "./sync-conflict-policy.ts";
import { scheduleSyncDrain } from "./sync-coordinator.ts";
import { requestCloudSyncPull, requestCloudSyncPush } from "./sync-network.ts";
import { createSyncPayload, getSyncPayloadSignature, type SyncPayload } from "./sync-payload.ts";
import { createSyncSession } from "./sync-session.ts";
import type { SyncScopeContext } from "./sync-scope.ts";
import { setSyncStatusError, setSyncStatusSuccess, startSyncStatus } from "./sync-status.ts";

export type SyncApp = Pick<
  AppContext,
  | "lots"
  | "sales"
  | "wheelConfigs"
  | "activeWheelConfigId"
  | "currentLotId"
  | "cloudSyncIntervalId"
  | "syncStatusResetTimeoutId"
  | "syncStatus"
  | "isOffline"
  | "lastSyncedPayloadHash"
  | "systemPricingDefaults"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "loadSalesForLotId"
  | "getSalesStorageKey"
  | "saveLotsToStorage"
  | "saveWheelConfigsToStorage"
  | "saveSystemPricingDefaultsToStorage"
  | "loadLot"
  | "notify"
  | "startOfflineReconnectScheduler"
  | "pullCloudSync"
  | "stopCloudSyncScheduler"
  | "handleWorkspaceAccessLost"
>;

export type SyncServiceDeps = {
  resolveApiBaseUrl: () => string;
  isOnline: () => boolean;
  requestCloudSyncPull: typeof requestCloudSyncPull;
  requestCloudSyncPush: typeof requestCloudSyncPush;
  createSyncPayload: (app: SyncApp, clientVersion?: number, scope?: SyncScopeContext) => SyncPayload;
  getSyncPayloadSignature: (payload: SyncPayload) => string;
  parseCloudSnapshot: (snapshot: unknown) => ParsedCloudSnapshot;
  shouldApplyCloudSnapshot: typeof shouldApplyCloudSnapshot;
  applyCloudSnapshotToLocal: (app: SyncApp, snapshot: ParsedCloudSnapshot) => void;
  startSyncStatus: (app: SyncApp) => void;
  setSyncStatusSuccess: (app: SyncApp) => void;
  setSyncStatusError: (app: SyncApp) => void;
  handlePushConflict: typeof handleSyncPushConflict;
  handleExpiredAuth: (app: Pick<SyncApp, "googleAuthEpoch" | "hasProAccess">) => void;
  getStoredClientVersion: (scope: AppStorageScope) => number;
  setStoredClientVersion: (scope: AppStorageScope, version: number) => void;
  setStoredLastSyncedPayloadHash: (scope: AppStorageScope, signature: string | null) => void;
  hasStorageItem: (scope: AppStorageScope, key: string) => boolean;
  now: () => number;
};

export type SyncPushOptions = {
  allowEmptyOverwrite?: boolean;
  scopeOverride?: AppStorageScope;
  treatConflictAsSuccess?: boolean;
};

export type SyncPullOptions = {
  forceApply?: boolean;
};

const defaultDeps: SyncServiceDeps = {
  resolveApiBaseUrl,
  isOnline: () => navigator.onLine,
  requestCloudSyncPull,
  requestCloudSyncPush,
  createSyncPayload: (app, clientVersion, scope) => createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    systemPricingDefaults: app.systemPricingDefaults,
    workspaceId: scope?.scopeType === "workspace" ? scope.workspaceId : undefined
  }, clientVersion),
  getSyncPayloadSignature,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  applyCloudSnapshotToLocal,
  startSyncStatus,
  setSyncStatusSuccess,
  setSyncStatusError,
  handlePushConflict: handleSyncPushConflict,
  handleExpiredAuth,
  getStoredClientVersion: (scope) => {
    const raw = localStorage.getItem(
      getScopedSyncClientVersionKey(scope)
    ) || "0";
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  setStoredClientVersion: (scope, version) => {
    localStorage.setItem(
      getScopedSyncClientVersionKey(scope),
      String(version)
    );
  },
  setStoredLastSyncedPayloadHash: (scope, signature) => {
    const key = getScopedLastSyncedPayloadHashKey(scope);
    if (signature) {
      localStorage.setItem(key, signature);
      return;
    }
    localStorage.removeItem(key);
  },
  hasStorageItem: (_scope, key) => !!localStorage.getItem(key),
  now: () => Date.now()
};

export async function runCloudSyncPull(
  app: SyncApp,
  deps: Partial<SyncServiceDeps> = {},
  options: SyncPullOptions = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SyncServiceDeps;
  const session = createSyncSession(app, resolvedDeps);
  const state = session.state;
  const shouldForceApply = options.forceApply === true;
  if (state.activeOperation === "pull") {
    if (shouldForceApply) {
      state.pendingPull = true;
      state.pendingPullForceApply = true;
    }
  } else {
    state.pendingPull = true;
    state.pendingPullForceApply = state.pendingPullForceApply || shouldForceApply;
  }
  return scheduleSyncDrain(session);
}

export function startCloudSyncScheduler(app: SyncApp, deps: Partial<SyncServiceDeps> = {}): void {
  if (app.cloudSyncIntervalId != null) return;
  app.cloudSyncIntervalId = window.setInterval(() => {
    void runCloudSyncPush(app, false, deps);
  }, CLOUD_SYNC_INTERVAL_MS);
}

export function stopCloudSyncScheduler(app: Pick<SyncApp, "cloudSyncIntervalId">): void {
  if (app.cloudSyncIntervalId == null) return;
  window.clearInterval(app.cloudSyncIntervalId);
  app.cloudSyncIntervalId = null;
}

export async function runCloudSyncPush(
  app: SyncApp,
  force = false,
  deps: Partial<SyncServiceDeps> = {},
  options: SyncPushOptions = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SyncServiceDeps;
  const session = createSyncSession(app, resolvedDeps, options);
  const state = session.state;
  state.pendingPush = true;
  state.pendingPushForce = state.pendingPushForce || force;
  state.pendingPushAllowEmptyOverwrite = state.pendingPushAllowEmptyOverwrite || options.allowEmptyOverwrite === true;
  state.pendingPushTreatConflictAsSuccess =
    state.pendingPushTreatConflictAsSuccess || options.treatConflictAsSuccess === true;
  return scheduleSyncDrain(session);
}
