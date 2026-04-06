import type { AppContext } from "../context-app.ts";
import { fetchAuthoritativeLivePricing, SalesLiveApiError, saveAuthoritativeLivePricing } from "./sales-live-api.ts";
import { markLivePricingPollingBaseline } from "./ui/lot-entity-polling.ts";

type QueuedLivePricingSnapshot = {
  lotId: number;
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
    liveSpotPrice: Number(snapshot.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(snapshot.liveBoxPriceSell) || 0,
    livePackPrice: Number(snapshot.livePackPrice) || 0,
    baseVersion: Math.max(0, Number(snapshot.baseVersion) || 0)
  });
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
        applyAuthoritativeLivePricingSnapshot(context, snapshot.lotId, latest);
      }
      context.notify("Live pricing changed in the cloud. Pulled latest saved prices.", "warning");
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

export function resetAuthoritativeLivePricingState(context: AppContext): void {
  context.currentLivePricingVersion = null;
  const state = getLivePricingQueueState(context as object);
  state.lastSavedHash = null;
  markLivePricingPollingBaseline(context as object, {
    liveSpotPrice: context.liveSpotPrice,
    liveBoxPriceSell: context.liveBoxPriceSell,
    livePackPrice: context.livePackPrice,
    currentLivePricingVersion: context.currentLivePricingVersion
  });
}

