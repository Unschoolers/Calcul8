import type { AppContext } from "../context-app.ts";
import { canUseAuthoritativeSalesLiveApi, SalesLiveApiError } from "./entity-api-shared.ts";
import { fetchAuthoritativeLivePricing, saveAuthoritativeLivePricing } from "./lot-live-pricing-api.ts";
import { markLivePricingPollingBaseline } from "./ui/sync/lot-entity-polling.ts";

type QueuedLivePricingSnapshot = {
  lotId: number;
  liveSpotPrice: number;
  liveBoxPriceSell: number;
  livePackPrice: number;
  baseVersion: number;
};

type LivePricingHydrationContext = Pick<
  AppContext,
  | "currentLotId"
  | "liveSpotPrice"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "currentLivePricingVersion"
  | "livePricingHydrationStatus"
  | "livePricingHydratedLotId"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "getSalesStorageKey"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "notify"
>;

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
    liveSpotPrice: Number(snapshot.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(snapshot.liveBoxPriceSell) || 0,
    livePackPrice: Number(snapshot.livePackPrice) || 0,
    baseVersion: Math.max(0, Number(snapshot.baseVersion) || 0)
  });
}

export function shouldHydrateAuthoritativeLivePricing(
  context: Pick<AppContext, "livePricingHydrationStatus" | "livePricingHydratedLotId">,
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

  context.livePricingHydrationStatus = "loading";
  context.livePricingHydratedLotId = lotId;
  try {
    const latest = await fetchAuthoritativeLivePricing(context, lotId);
    if (Number(context.currentLotId) !== lotId) return;
    if (latest) {
      applyAuthoritativeLivePricingSnapshot(context as AppContext, lotId, latest);
    } else {
      resetAuthoritativeLivePricingState(context as AppContext, lotId);
    }
  } catch (error) {
    if (Number(context.currentLotId) === lotId) {
      context.livePricingHydrationStatus = "error";
      context.livePricingHydratedLotId = lotId;
    }
    throw error;
  }
}

async function flushQueuedLivePricingSave(context: AppContext, notifySuccess = true): Promise<void> {
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

  try {
    const saved = await saveAuthoritativeLivePricing(context, snapshot.lotId, {
      liveSpotPrice: snapshot.liveSpotPrice,
      liveBoxPriceSell: snapshot.liveBoxPriceSell,
      livePackPrice: snapshot.livePackPrice,
      currentLivePricingVersion: snapshot.baseVersion
    });
    context.currentLivePricingVersion = saved.version;
    context.livePricingHydrationStatus = "hydrated";
    context.livePricingHydratedLotId = snapshot.lotId;
    state.lastSavedHash = createLivePricingHash({
      lotId: snapshot.lotId,
      liveSpotPrice: saved.liveSpotPrice,
      liveBoxPriceSell: saved.liveBoxPriceSell,
      livePackPrice: saved.livePackPrice,
      baseVersion: saved.version ?? 0
    });
    markLivePricingPollingBaseline(context as object, {
      liveSpotPrice: saved.liveSpotPrice,
      liveBoxPriceSell: saved.liveBoxPriceSell,
      livePackPrice: saved.livePackPrice,
      currentLivePricingVersion: saved.version
    });
    if (notifySuccess) {
      context.notify("Live prices saved", "success");
    }
  } catch (error) {
    if (error instanceof SalesLiveApiError && error.status === 409) {
      const latest = await fetchAuthoritativeLivePricing(context, snapshot.lotId).catch(() => null);
      if (latest) {
        // Update context with latest version and queue a retry with the new baseVersion
        context.currentLivePricingVersion = latest.version;
        context.livePricingHydrationStatus = "hydrated";
        context.livePricingHydratedLotId = snapshot.lotId;
        state.queuedSnapshot = {
          lotId: snapshot.lotId,
          liveSpotPrice: Number(context.liveSpotPrice) || 0,
          liveBoxPriceSell: Number(context.liveBoxPriceSell) || 0,
          livePackPrice: Number(context.livePackPrice) || 0,
          baseVersion: latest.version ?? 0
        };
        context.notify("Live pricing changed. Retrying save with latest version...", "info");
      } else {
        context.notify("Live pricing changed in the cloud. Please try saving again.", "warning");
      }
    } else {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to save live pricing.";
      context.notify(message, "error");
    }
  } finally {
    state.inFlight = false;
    if (state.queuedSnapshot) {
      void flushQueuedLivePricingSave(context, notifySuccess);
    }
  }
}

export function queueAuthoritativeLivePricingSave(context: AppContext, lotId: number): void {
  const state = getLivePricingQueueState(context as object);
  const nextSnapshot: QueuedLivePricingSnapshot = {
    lotId,
    liveSpotPrice: Number(context.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(context.liveBoxPriceSell) || 0,
    livePackPrice: Number(context.livePackPrice) || 0,
    baseVersion: context.currentLivePricingVersion ?? 0
  };
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
    void flushQueuedLivePricingSave(context, true);
  }, LIVE_PRICING_SAVE_DELAY_MS));
}

export function applyAuthoritativeLivePricingSnapshot(
  context: AppContext,
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
  state.lastSavedHash = createLivePricingHash({
    lotId,
    liveSpotPrice: latest.liveSpotPrice,
    liveBoxPriceSell: latest.liveBoxPriceSell,
    livePackPrice: latest.livePackPrice,
    baseVersion: latest.version ?? 0
  });
  markLivePricingPollingBaseline(context as object, {
    liveSpotPrice: latest.liveSpotPrice,
    liveBoxPriceSell: latest.liveBoxPriceSell,
    livePackPrice: latest.livePackPrice,
    currentLivePricingVersion: latest.version
  });
}

export function resetAuthoritativeLivePricingState(context: AppContext, lotId?: number): void {
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
