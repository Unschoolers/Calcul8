import type {
  LivePricingHydrationContext,
  QueuedLivePricingContext
} from "../context/commerce.ts";
import { canUseAuthoritativeSalesLiveApi, SalesLiveApiError } from "./entity-api-shared.ts";
import { captureWorkspaceScopeGuard } from "../workspace-scope.ts";
import {
  fetchAuthoritativeLivePricing,
  saveAuthoritativeLivePricing,
  type LivePricingRequestOptions
} from "./lot-live-pricing-api.ts";
import { markLivePricingPollingBaseline } from "./ui/sync/lot-entity-polling.ts";

type QueuedLivePricingSnapshot = {
  lotId: number;
  scopeType: QueuedLivePricingContext["activeScopeType"];
  workspaceId: string | null;
  authEpoch: number;
  lotHydrationRevision: number;
  isScopeVisitCurrent: () => boolean;
  liveSpotPrice: number;
  liveBoxPriceSell: number;
  livePackPrice: number;
  baseVersion: number;
};

type LivePricingQueueState = {
  timeoutId: number | null;
  inFlight: boolean;
  queuedSnapshot: QueuedLivePricingSnapshot | null;
  lastSavedHash: string | null;
};

const LIVE_PRICING_SAVE_DELAY_MS = 500;
const livePricingQueueStateByContext = new WeakMap<object, LivePricingQueueState>();

function getLivePricingQueueState(context: object): LivePricingQueueState {
  let state = livePricingQueueStateByContext.get(context);
  if (!state) {
    state = {
      timeoutId: null,
      inFlight: false,
      queuedSnapshot: null,
      lastSavedHash: null
    };
    livePricingQueueStateByContext.set(context, state);
  }
  return state;
}

function createLivePricingHash(snapshot: QueuedLivePricingSnapshot): string {
  return JSON.stringify({
    lotId: snapshot.lotId,
    scopeType: snapshot.scopeType,
    workspaceId: snapshot.workspaceId,
    authEpoch: snapshot.authEpoch,
    lotHydrationRevision: snapshot.lotHydrationRevision,
    liveSpotPrice: Number(snapshot.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(snapshot.liveBoxPriceSell) || 0,
    livePackPrice: Number(snapshot.livePackPrice) || 0,
    baseVersion: Math.max(0, Number(snapshot.baseVersion) || 0)
  });
}

function captureSnapshot(context: QueuedLivePricingContext, lotId: number): QueuedLivePricingSnapshot {
  return {
    lotId,
    scopeType: context.activeScopeType,
    workspaceId: context.activeWorkspaceId,
    authEpoch: context.googleAuthEpoch,
    lotHydrationRevision: context.lotHydrationRevision,
    isScopeVisitCurrent: captureWorkspaceScopeGuard(context),
    liveSpotPrice: Number(context.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(context.liveBoxPriceSell) || 0,
    livePackPrice: Number(context.livePackPrice) || 0,
    baseVersion: context.currentLivePricingVersion ?? 0
  };
}

function isSnapshotCurrent(context: QueuedLivePricingContext, snapshot: QueuedLivePricingSnapshot): boolean {
  return snapshot.isScopeVisitCurrent()
    && context.currentLotId === snapshot.lotId
    && context.activeScopeType === snapshot.scopeType
    && context.activeWorkspaceId === snapshot.workspaceId
    && context.googleAuthEpoch === snapshot.authEpoch
    && context.lotHydrationRevision === snapshot.lotHydrationRevision;
}

function requestOptions(
  context: QueuedLivePricingContext,
  snapshot: QueuedLivePricingSnapshot
): LivePricingRequestOptions {
  return {
    scope: { scopeType: snapshot.scopeType, workspaceId: snapshot.workspaceId },
    isRequestCurrent: () => isSnapshotCurrent(context, snapshot)
  };
}

export function shouldHydrateAuthoritativeLivePricing(
  context: Pick<LivePricingHydrationContext, "livePricingHydrationStatus" | "livePricingHydratedLotId">,
  lotId: number
): boolean {
  if (context.livePricingHydrationStatus === "loading") return false;
  if (context.livePricingHydratedLotId !== lotId) return true;
  return context.livePricingHydrationStatus !== "hydrated"
    && context.livePricingHydrationStatus !== "missing";
}

export async function hydrateAuthoritativeLivePricingForLot(
  context: LivePricingHydrationContext,
  lotId: number
): Promise<void> {
  if (!shouldHydrateAuthoritativeLivePricing(context, lotId)) return;
  if (!canUseAuthoritativeSalesLiveApi()) return;

  const snapshot = captureSnapshot(context, lotId);
  if (!isSnapshotCurrent(context, snapshot)) return;

  context.livePricingHydrationStatus = "loading";
  context.livePricingHydratedLotId = lotId;
  try {
    const latest = await fetchAuthoritativeLivePricing(context, lotId, requestOptions(context, snapshot));
    if (!isSnapshotCurrent(context, snapshot)) return;
    if (latest) {
      applyAuthoritativeLivePricingSnapshot(context, lotId, latest);
    } else {
      resetAuthoritativeLivePricingState(context, lotId);
    }
  } catch (error) {
    if (isSnapshotCurrent(context, snapshot)) {
      context.livePricingHydrationStatus = "error";
      context.livePricingHydratedLotId = lotId;
    }
    throw error;
  }
}

async function flushQueuedLivePricingSave(context: QueuedLivePricingContext, notifySuccess = true): Promise<void> {
  const state = getLivePricingQueueState(context as object);
  if (state.inFlight || !state.queuedSnapshot) {
    return;
  }

  const snapshot = state.queuedSnapshot;
  const snapshotHash = createLivePricingHash(snapshot);
  if (state.lastSavedHash === snapshotHash) {
    state.queuedSnapshot = null;
    return;
  }

  state.inFlight = true;
  state.queuedSnapshot = null;

  let currentSnapshot = snapshot;
  let conflictRetried = false;
  let drainQueuedSnapshot = true;
  try {
    while (true) {
      if (!isSnapshotCurrent(context, currentSnapshot)) return;
      let saved;
      try {
        saved = await saveAuthoritativeLivePricing(context, currentSnapshot.lotId, {
          liveSpotPrice: currentSnapshot.liveSpotPrice,
          liveBoxPriceSell: currentSnapshot.liveBoxPriceSell,
          livePackPrice: currentSnapshot.livePackPrice,
          currentLivePricingVersion: currentSnapshot.baseVersion
        }, requestOptions(context, currentSnapshot));
      } catch (error) {
        if (!isSnapshotCurrent(context, currentSnapshot)) return;
        if (error instanceof SalesLiveApiError && error.status === 409) {
          if (conflictRetried) {
            drainQueuedSnapshot = false;
            context.notify("Live pricing changed in the cloud. Please review and save again.", "warning");
            return;
          }
          // Check ownership before dispatching recovery GET. The API also checks before each network/auth action.
          if (!isSnapshotCurrent(context, currentSnapshot)) return;
          const latest = await fetchAuthoritativeLivePricing(context, currentSnapshot.lotId, requestOptions(context, currentSnapshot)).catch(() => null);
          if (!isSnapshotCurrent(context, currentSnapshot)) return;
          if (!latest) {
            context.notify("Live pricing changed in the cloud. Please try saving again.", "warning");
            return;
          }
          context.currentLivePricingVersion = latest.version;
          context.livePricingHydrationStatus = "hydrated";
          context.livePricingHydratedLotId = currentSnapshot.lotId;
          const queuedAfterConflict: QueuedLivePricingSnapshot | null = state.queuedSnapshot;
          if (queuedAfterConflict && isSnapshotCurrent(context, queuedAfterConflict)) {
            state.queuedSnapshot = Object.assign({}, queuedAfterConflict, { baseVersion: latest.version ?? 0 });
          }
          currentSnapshot = { ...snapshot, baseVersion: latest.version ?? 0 };
          conflictRetried = true;
          context.notify("Live pricing changed. Retrying save with latest version...", "info");
          continue;
        }
        const message = error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to save live pricing.";
        context.notify(message, "error");
        return;
      }

      if (!isSnapshotCurrent(context, currentSnapshot)) return;
      context.currentLivePricingVersion = saved.version;
      context.livePricingHydrationStatus = "hydrated";
      context.livePricingHydratedLotId = currentSnapshot.lotId;
      state.lastSavedHash = createLivePricingHash({
        ...currentSnapshot,
        liveSpotPrice: saved.liveSpotPrice,
        liveBoxPriceSell: saved.liveBoxPriceSell,
        livePackPrice: saved.livePackPrice,
        baseVersion: saved.version ?? 0
      });
      const queuedAfterSave: QueuedLivePricingSnapshot | null = state.queuedSnapshot;
      if (queuedAfterSave && isSnapshotCurrent(context, queuedAfterSave)) {
        state.queuedSnapshot = Object.assign({}, queuedAfterSave, { baseVersion: saved.version ?? 0 });
      }
      markLivePricingPollingBaseline(context as object, {
        liveSpotPrice: saved.liveSpotPrice,
        liveBoxPriceSell: saved.liveBoxPriceSell,
        livePackPrice: saved.livePackPrice,
        currentLivePricingVersion: saved.version
      });
      if (notifySuccess) context.notify("Live prices saved", "success");
      return;
    }
  } finally {
    state.inFlight = false;
    if (!drainQueuedSnapshot && state.timeoutId != null) {
      globalThis.clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
    if (drainQueuedSnapshot && state.queuedSnapshot) void flushQueuedLivePricingSave(context, notifySuccess);
  }
}

export function queueAuthoritativeLivePricingSave(context: QueuedLivePricingContext, lotId: number): void {
  const state = getLivePricingQueueState(context as object);
  const nextSnapshot = captureSnapshot(context, lotId);
  const nextHash = createLivePricingHash(nextSnapshot);
  if (state.lastSavedHash === nextHash && !state.inFlight) {
    return;
  }

  state.queuedSnapshot = nextSnapshot;
  if (state.timeoutId != null) {
    globalThis.clearTimeout(state.timeoutId);
  }
  state.timeoutId = Number(globalThis.setTimeout(() => {
    state.timeoutId = null;
    if (!isSnapshotCurrent(context, nextSnapshot)) return;
    void flushQueuedLivePricingSave(context, true);
  }, LIVE_PRICING_SAVE_DELAY_MS));
}

export function applyAuthoritativeLivePricingSnapshot(
  context: QueuedLivePricingContext,
  lotId: number,
  latest: {
    liveSpotPrice: number;
    liveBoxPriceSell: number;
    livePackPrice: number;
    version: number | null;
  }
): void {
  context.liveSpotPrice = latest.liveSpotPrice;
  context.liveBoxPriceSell = latest.liveBoxPriceSell;
  context.livePackPrice = latest.livePackPrice;
  context.currentLivePricingVersion = latest.version;
  context.livePricingHydrationStatus = "hydrated";
  context.livePricingHydratedLotId = lotId;
  const state = getLivePricingQueueState(context as object);
  state.lastSavedHash = createLivePricingHash(captureSnapshot(context, lotId));
  markLivePricingPollingBaseline(context as object, {
    liveSpotPrice: latest.liveSpotPrice,
    liveBoxPriceSell: latest.liveBoxPriceSell,
    livePackPrice: latest.livePackPrice,
    currentLivePricingVersion: latest.version
  });
}

export function resetAuthoritativeLivePricingState(context: QueuedLivePricingContext, lotId?: number): void {
  context.currentLivePricingVersion = null;
  context.livePricingHydrationStatus = typeof lotId === "number" ? "missing" : "idle";
  context.livePricingHydratedLotId = typeof lotId === "number" ? lotId : null;
  const state = getLivePricingQueueState(context as object);
  state.lastSavedHash = null;
  markLivePricingPollingBaseline(context as object, {
    liveSpotPrice: context.liveSpotPrice,
    liveBoxPriceSell: context.liveBoxPriceSell,
    livePackPrice: context.livePackPrice,
    currentLivePricingVersion: context.currentLivePricingVersion
  });
}
