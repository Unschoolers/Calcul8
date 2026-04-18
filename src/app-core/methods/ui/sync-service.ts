import { getStoredGoogleIdToken } from "../../auth/index.ts";
import type { AppContext } from "../../context-app.ts";
import {
  getScopedLastSyncedPayloadHashKey,
  getScopedSyncClientVersionKey,
  type AppStorageScope
} from "../../storageKeys.ts";
import { getActiveWorkspaceId } from "../../workspace-scope.ts";
import {
  CLOUD_SYNC_INTERVAL_MS,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";
import {
  applyCloudSnapshotToLocal,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  type ParsedCloudSnapshot
} from "./sync-apply.ts";
import { getSyncCoordinatorState, scheduleSyncDrain } from "./sync-coordinator.ts";
import { requestCloudSyncPull, requestCloudSyncPush } from "./sync-network.ts";
import { createSyncPayload, getSyncPayloadSignature, type SyncPayload } from "./sync-payload.ts";
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
  | "googleAuthEpoch"
  | "hasProAccess"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "loadSalesForLotId"
  | "getSalesStorageKey"
  | "saveLotsToStorage"
  | "saveWheelConfigsToStorage"
  | "loadLot"
  | "notify"
  | "startOfflineReconnectScheduler"
  | "pullCloudSync"
  | "stopCloudSyncScheduler"
  | "handleWorkspaceAccessLost"
>;

export type SyncServiceDeps = {
  resolveApiBaseUrl: () => string;
  getGoogleIdToken: () => string;
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

export type SyncScopeContext = AppStorageScope & {
  scopeKey: string;
};

function resolveSyncScopeContext(app: Pick<SyncApp, "activeScopeType" | "activeWorkspaceId">): SyncScopeContext {
  const workspaceId = app.activeScopeType === "workspace"
    ? String(app.activeWorkspaceId ?? "").trim() || null
    : null;
  if (workspaceId) {
    return {
      scopeType: "workspace",
      workspaceId,
      scopeKey: `workspace:${workspaceId}`
    };
  }

  return {
    scopeType: "personal",
    scopeKey: "personal"
  };
}

const defaultDeps: SyncServiceDeps = {
  resolveApiBaseUrl,
  getGoogleIdToken: () => getStoredGoogleIdToken(),
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
    workspaceId: scope?.scopeType === "workspace"
      ? scope.workspaceId
      : getActiveWorkspaceId(app)
  }, clientVersion),
  getSyncPayloadSignature,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  applyCloudSnapshotToLocal,
  startSyncStatus,
  setSyncStatusSuccess,
  setSyncStatusError,
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
  const scope = resolveSyncScopeContext(app);
  const state = getSyncCoordinatorState(app as object, scope.scopeKey);
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
  return scheduleSyncDrain(app, resolvedDeps, state, scope);
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
  const scope = options.scopeOverride
    ? {
      ...options.scopeOverride,
      scopeKey: options.scopeOverride.scopeType === "workspace"
        ? `workspace:${String(options.scopeOverride.workspaceId ?? "").trim()}`
        : "personal"
    }
    : resolveSyncScopeContext(app);
  const state = getSyncCoordinatorState(app as object, scope.scopeKey);
  state.pendingPush = true;
  state.pendingPushForce = state.pendingPushForce || force;
  state.pendingPushAllowEmptyOverwrite = state.pendingPushAllowEmptyOverwrite || options.allowEmptyOverwrite === true;
  state.pendingPushTreatConflictAsSuccess =
    state.pendingPushTreatConflictAsSuccess || options.treatConflictAsSuccess === true;
  return scheduleSyncDrain(app, resolvedDeps, state, scope);
}
