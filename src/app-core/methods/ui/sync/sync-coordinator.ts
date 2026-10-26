import { performCloudSyncPull } from "./sync-pull.ts";
import { performCloudSyncPush } from "./sync-push.ts";
import type { SyncSession } from "./sync-session.ts";
import type { PersistenceOutcome } from "../../../shared/persistence-outcomes.ts";
import type { UnacknowledgedSyncPush } from "./sync-push-acknowledgement.ts";

type Completion = (outcome: PersistenceOutcome) => void;
type GuardedPull = {
  forceApply: boolean;
  expectedPayloadSignature?: string;
  isRequestCurrent?: () => boolean;
  completion: Completion;
};

export type SyncCoordinatorState = {
  unacknowledgedPush: UnacknowledgedSyncPush | null;
  drainPromise: Promise<void> | null;
  activeOperation: "pull" | "push" | null;
  pendingPull: boolean;
  pendingPullForceApply: boolean;
  pendingPush: boolean;
  pendingPushForce: boolean;
  pendingPushAllowEmptyOverwrite: boolean;
  pendingPushTreatConflictAsSuccess: boolean;
  pendingPullCompletions: Completion[];
  activePullCompletions: Completion[];
  pendingPushCompletions: Completion[];
  pendingGuardedPulls: GuardedPull[];
  cleanConflictRecovery: {
    promise: Promise<PersistenceOutcome>;
    outcome?: PersistenceOutcome;
  } | null;
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
      unacknowledgedPush: null,
      drainPromise: null,
      activeOperation: null,
      pendingPull: false,
      pendingPullForceApply: false,
      pendingPush: false,
      pendingPushForce: false,
      pendingPushAllowEmptyOverwrite: false,
      pendingPushTreatConflictAsSuccess: false,
      pendingPullCompletions: [],
      activePullCompletions: [],
      pendingPushCompletions: [],
      pendingGuardedPulls: [],
      cleanConflictRecovery: null
    };
    scopeStates.set(scopeKey, state);
  }
  return state;
}

async function drainSyncQueue(
  session: SyncSession
): Promise<void> {
  const { app, deps, state } = session;
  while (state.pendingGuardedPulls.length > 0 || state.pendingPull || state.pendingPush) {
    if (state.pendingGuardedPulls.length > 0) {
      const guardedPull = state.pendingGuardedPulls.shift()!;
      state.activeOperation = "pull";
      let outcome: PersistenceOutcome;
      try {
        outcome = await performCloudSyncPull(session, {
          forceApply: guardedPull.forceApply,
          expectedPayloadSignature: guardedPull.expectedPayloadSignature,
          isRequestCurrent: guardedPull.isRequestCurrent
        });
      } catch (error) {
        if (!session.isCurrentScope()) outcome = { kind: "skipped", reason: "stale-scope" };
        else {
          deps.setSyncStatusError(app);
          console.warn("[whatfees] Cloud sync guarded pull coordinator error", error);
          outcome = { kind: "failure", error, stage: "sync" };
        }
      } finally {
        state.activeOperation = null;
      }
      guardedPull.completion(outcome);
      continue;
    }

    if (state.pendingPull) {
      const forceApply = state.pendingPullForceApply;
      state.pendingPull = false;
      state.pendingPullForceApply = false;
      state.activePullCompletions = state.pendingPullCompletions.splice(0);
      if (!forceApply && state.cleanConflictRecovery?.outcome) {
        const recoveryOutcome = state.cleanConflictRecovery.outcome;
        state.cleanConflictRecovery = null;
        for (const complete of state.activePullCompletions.splice(0)) complete(recoveryOutcome);
        continue;
      }
      state.cleanConflictRecovery = null;
      state.activeOperation = "pull";
      let outcome: PersistenceOutcome;
      try {
        outcome = await performCloudSyncPull(session, { forceApply });
      } catch (error) {
        if (!session.isCurrentScope()) outcome = { kind: "skipped", reason: "stale-scope" };
        else {
          deps.setSyncStatusError(app);
          console.warn("[whatfees] Cloud sync pull coordinator error", error);
          outcome = { kind: "failure", error, stage: "sync" };
        }
      } finally {
        state.activeOperation = null;
      }
      for (const complete of state.activePullCompletions.splice(0)) complete(outcome);
      continue;
    }

    const force = state.pendingPushForce;
    const allowEmptyOverwrite = state.pendingPushAllowEmptyOverwrite;
    const treatConflictAsSuccess = state.pendingPushTreatConflictAsSuccess;
    state.pendingPush = false;
    state.pendingPushForce = false;
    state.pendingPushAllowEmptyOverwrite = false;
    state.pendingPushTreatConflictAsSuccess = false;
    const completions = state.pendingPushCompletions.splice(0);
    state.activeOperation = "push";
    let outcome: PersistenceOutcome;
    try {
      outcome = await performCloudSyncPush(session, force, { allowEmptyOverwrite, treatConflictAsSuccess });
    } catch (error) {
      if (!session.isCurrentScope()) outcome = { kind: "skipped", reason: "stale-scope" };
      else {
        deps.setSyncStatusError(app);
        console.warn("[whatfees] Cloud sync push coordinator error", error);
        outcome = { kind: "failure", error, stage: "sync" };
      }
    } finally {
      state.activeOperation = null;
    }
    for (const complete of completions) complete(outcome);
    if (!state.pendingPull) state.cleanConflictRecovery = null;
  }
}

export function beginCleanConflictRecovery(
  session: SyncSession,
  recover: () => Promise<PersistenceOutcome>
): Promise<PersistenceOutcome> {
  const existing = session.state.cleanConflictRecovery;
  if (existing) return existing.promise;

  const recovery: NonNullable<SyncCoordinatorState["cleanConflictRecovery"]> = {
    promise: Promise.resolve({ kind: "failure", error: new Error("Clean conflict recovery did not start."), stage: "sync" })
  };
  session.state.cleanConflictRecovery = recovery;
  recovery.promise = Promise.resolve().then(recover).then((outcome) => {
    recovery.outcome = outcome;
    return outcome;
  }, (error): PersistenceOutcome => {
    const outcome: PersistenceOutcome = session.isCurrentScope()
      ? { kind: "failure", error, stage: "sync" }
      : { kind: "skipped", reason: "stale-scope" };
    recovery.outcome = outcome;
    return outcome;
  });
  return recovery.promise;
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
      if (state.pendingGuardedPulls.length > 0 || state.pendingPull || state.pendingPush) void scheduleSyncDrain(session);
    }
  })();

  return state.drainPromise;
}
