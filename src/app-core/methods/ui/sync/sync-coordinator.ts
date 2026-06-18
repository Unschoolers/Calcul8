import { performCloudSyncPull } from "./sync-pull.ts";
import { performCloudSyncPush } from "./sync-push.ts";
import type { SyncSession } from "./sync-session.ts";

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
  session: SyncSession
): Promise<void> {
  const { app, deps, state } = session;
  while (state.pendingPull || state.pendingPush) {
    if (state.pendingPull) {
      const forceApply = state.pendingPullForceApply;
      state.pendingPull = false;
      state.pendingPullForceApply = false;
      state.activeOperation = "pull";
      try {
        await performCloudSyncPull(session, { forceApply });
      } catch (error) {
        deps.setSyncStatusError(app);
        console.warn("[whatfees] Cloud sync pull coordinator error", error);
      } finally {
        state.activeOperation = null;
      }
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
    try {
      await performCloudSyncPush(session, force, { allowEmptyOverwrite, treatConflictAsSuccess });
    } catch (error) {
      deps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push coordinator error", error);
    } finally {
      state.activeOperation = null;
    }
  }
}

export function scheduleSyncDrain(session: SyncSession): Promise<void> {
  const { state } = session;
  if (state.drainPromise) {
    return state.drainPromise;
  }

  state.drainPromise = (async () => {
    try {
      await drainSyncQueue(session);
    } finally {
      state.drainPromise = null;
      if (state.pendingPull || state.pendingPush) {
        void scheduleSyncDrain(session);
      }
    }
  })();

  return state.drainPromise;
}
