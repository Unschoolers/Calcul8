import type { AppContext } from "../../context.ts";
import {
  CLOUD_SYNC_INTERVAL_MS,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";
import { getStoredGoogleIdToken } from "../../auth/index.ts";
import {
  getSalesStorageKey as getScopedSalesStorageKey,
  type AppStorageScope,
  getScopedLastSyncedPayloadHashKey,
  getScopedPresetsStorageKey,
  getScopedSyncClientVersionKey
} from "../../storageKeys.ts";
import {
  applyCloudSnapshotToLocal,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  type ParsedCloudSnapshot
} from "./sync-apply.ts";
import { requestCloudSyncPull, requestCloudSyncPush, type SyncPullResponseBody, type SyncPushResponseBody } from "./sync-network.ts";
import { createSyncPayload, getSyncPayloadSignature, type SyncPayload } from "./sync-payload.ts";
import { setSyncStatusError, setSyncStatusSuccess, startSyncStatus } from "./sync-status.ts";
import { getActiveWorkspaceId } from "../../workspace-scope.ts";

const STORAGE_RESET_RECOVERY_COOLDOWN_MS = 30_000;

type SyncRecoveryState = {
  __syncStorageResetRecoveryAtMs?: number;
};

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

type SyncServiceDeps = {
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

type SyncPushOptions = {
  allowEmptyOverwrite?: boolean;
  scopeOverride?: AppStorageScope;
  treatConflictAsSuccess?: boolean;
};

type SyncPullOptions = {
  forceApply?: boolean;
};

type SyncScopeContext = AppStorageScope & {
  scopeKey: string;
};

type SyncCoordinatorState = {
  drainPromise: Promise<void> | null;
  activeOperation: "pull" | "push" | null;
  pendingPull: boolean;
  pendingPullForceApply: boolean;
  pendingPush: boolean;
  pendingPushForce: boolean;
  pendingPushAllowEmptyOverwrite: boolean;
  pendingPushTreatConflictAsSuccess: boolean;
};

const syncCoordinatorStateByApp = new WeakMap<object, Map<string, SyncCoordinatorState>>();

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

function isLocalSyncCacheReset(app: SyncApp, deps: SyncServiceDeps, scope: SyncScopeContext): boolean {
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

function shouldAttemptStorageResetRecovery(app: SyncApp, deps: SyncServiceDeps): boolean {
  const state = app as SyncApp & SyncRecoveryState;
  const nowMs = deps.now();
  const lastAttemptMs = Number(state.__syncStorageResetRecoveryAtMs ?? 0);
  if (Number.isFinite(lastAttemptMs) && lastAttemptMs > 0 && nowMs - lastAttemptMs < STORAGE_RESET_RECOVERY_COOLDOWN_MS) {
    return false;
  }
  state.__syncStorageResetRecoveryAtMs = nowMs;
  return true;
}

function getSyncCoordinatorState(app: object, scopeKey: string): SyncCoordinatorState {
  let scopeStates = syncCoordinatorStateByApp.get(app);
  if (!scopeStates) {
    scopeStates = new Map<string, SyncCoordinatorState>();
    syncCoordinatorStateByApp.set(app, scopeStates);
  }

  let state = scopeStates.get(scopeKey);
  if (!state) {
    state = {
      drainPromise: null,
      activeOperation: null,
      pendingPull: false,
      pendingPullForceApply: false,
      pendingPush: false,
      pendingPushForce: false,
      pendingPushAllowEmptyOverwrite: false,
      pendingPushTreatConflictAsSuccess: false
    };
    scopeStates.set(scopeKey, state);
  }
  return state;
}

async function drainSyncQueue(
  app: SyncApp,
  deps: SyncServiceDeps,
  state: SyncCoordinatorState,
  scope: SyncScopeContext
): Promise<void> {
  while (state.pendingPull || state.pendingPush) {
    if (state.pendingPull) {
      const forceApply = state.pendingPullForceApply;
      state.pendingPull = false;
      state.pendingPullForceApply = false;
      state.activeOperation = "pull";
      await performCloudSyncPull(app, deps, scope, { forceApply });
      state.activeOperation = null;
      continue;
    }

    const force = state.pendingPushForce;
    const allowEmptyOverwrite = state.pendingPushAllowEmptyOverwrite;
    const treatConflictAsSuccess = state.pendingPushTreatConflictAsSuccess;
    state.pendingPush = false;
    state.pendingPushForce = false;
    state.pendingPushAllowEmptyOverwrite = false;
    state.pendingPushTreatConflictAsSuccess = false;
    state.activeOperation = "push";
    await performCloudSyncPush(app, force, deps, scope, { allowEmptyOverwrite, treatConflictAsSuccess });
    state.activeOperation = null;
  }
}

function scheduleSyncDrain(
  app: SyncApp,
  deps: SyncServiceDeps,
  state: SyncCoordinatorState,
  scope: SyncScopeContext
): Promise<void> {
  if (state.drainPromise) {
    return state.drainPromise;
  }

  state.drainPromise = (async () => {
    try {
      await drainSyncQueue(app, deps, state, scope);
    } finally {
      state.drainPromise = null;
      if (state.pendingPull || state.pendingPush) {
        void scheduleSyncDrain(app, deps, state, scope);
      }
    }
  })();

  return state.drainPromise;
}

async function performCloudSyncPull(
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

async function performCloudSyncPush(
  app: SyncApp,
  force = false,
  resolvedDeps: SyncServiceDeps,
  scope: SyncScopeContext,
  options: SyncPushOptions = {}
): Promise<void> {
  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) return;
  if (!resolvedDeps.isOnline()) {
    app.isOffline = true;
    app.startOfflineReconnectScheduler();
    return;
  }

  if (isLocalSyncCacheReset(app, resolvedDeps, scope)) {
    console.warn("[whatfees] Cloud sync push skipped: local cache reset detected, pulling first");
    if (shouldAttemptStorageResetRecovery(app, resolvedDeps)) {
      void app.pullCloudSync();
    }
    return;
  }

  const clientVersion = resolvedDeps.getStoredClientVersion(scope);
  const syncPayload = resolvedDeps.createSyncPayload(app, clientVersion, scope);
  if (options.allowEmptyOverwrite === true) {
    syncPayload.allowEmptyOverwrite = true;
  }
  const payloadSignature = resolvedDeps.getSyncPayloadSignature(syncPayload);
  if (!force && app.lastSyncedPayloadHash === payloadSignature) {
    return;
  }
  resolvedDeps.startSyncStatus(app);

  try {
    const response = await resolvedDeps.requestCloudSyncPush(base, syncPayload, "session-preferred");

    if (response.status === 401) {
      resolvedDeps.handleExpiredAuth(app);
      if (typeof app.stopCloudSyncScheduler === "function") {
        app.stopCloudSyncScheduler();
      }
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync skipped: auth expired");
      return;
    }
    if (response.status === 403 && app.activeScopeType === "workspace") {
      resolvedDeps.setSyncStatusError(app);
      await app.handleWorkspaceAccessLost(app.activeWorkspaceId ?? undefined);
      return;
    }
    if (response.status === 409) {
      if (options.treatConflictAsSuccess === true) {
        resolvedDeps.setSyncStatusSuccess(app);
        console.warn("[whatfees] Cloud sync push conflict ignored for scoped seed");
        return;
      }
      resolvedDeps.setSyncStatusError(app);
      void app.pullCloudSync();
      app.notify("Cloud data changed. Pulled latest data. Please retry your change.", "warning");
      console.warn("[whatfees] Cloud sync push conflict: pulled latest snapshot");
      return;
    }

    if (!response.ok) {
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPushResponseBody;
    const serverVersion = Number(body.version);
    if (Number.isFinite(serverVersion)) {
      resolvedDeps.setStoredClientVersion(scope, serverVersion);
    }
    app.lastSyncedPayloadHash = payloadSignature;
    resolvedDeps.setStoredLastSyncedPayloadHash(scope, payloadSignature);
    resolvedDeps.setSyncStatusSuccess(app);
    console.info("[whatfees] Cloud sync pushed");
  } catch (error) {
    if (!resolvedDeps.isOnline()) {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    }
    resolvedDeps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync push error", error);
  }
}

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
