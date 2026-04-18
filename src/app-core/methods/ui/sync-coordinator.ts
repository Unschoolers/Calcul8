import { performCloudSyncPull } from "./sync-pull.ts";
import { performCloudSyncPush } from "./sync-push.ts";
import type { SyncApp, SyncScopeContext, SyncServiceDeps } from "./sync-service.ts";

export type SyncCoordinatorState = {
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

export function getSyncCoordinatorState(app: object, scopeKey: string): SyncCoordinatorState {
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

export function scheduleSyncDrain(
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
