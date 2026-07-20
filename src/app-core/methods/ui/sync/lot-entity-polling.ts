import type { SyncPollingContext } from "../../../context/sync.ts";
import { type LotLivePricingRecord } from "../../lot-live-pricing-api.ts";

const livePricingBaselineHashes = new WeakMap<object, string | null>();

export function createLivePricingPollingHash(
  pricing: SyncPollingContext
): string {
  return JSON.stringify({
    liveSpotPrice: Number(pricing.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(pricing.liveBoxPriceSell) || 0,
    livePackPrice: Number(pricing.livePackPrice) || 0,
    version: pricing.currentLivePricingVersion ?? null
  });
}

export function markLivePricingPollingBaseline(
  app: object,
  pricing: SyncPollingContext | null
): void {
  livePricingBaselineHashes.set(app, pricing ? createLivePricingPollingHash(pricing) : null);
}

function applyLivePricingSnapshot(app: SyncPollingContext, livePricing: LotLivePricingRecord): void {
  app.liveSpotPrice = livePricing.liveSpotPrice;
  app.liveBoxPriceSell = livePricing.liveBoxPriceSell;
  app.livePackPrice = livePricing.livePackPrice;
  app.currentLivePricingVersion = livePricing.version;
}

export function reconcileIncomingLivePricingSnapshot(
  app: SyncPollingContext,
  latestLivePricing: LotLivePricingRecord
): boolean {
  const currentLiveHash = createLivePricingPollingHash(app);
  const baselineHash = livePricingBaselineHashes.get(app as object) ?? currentLiveHash;
  const latestHash = createLivePricingPollingHash({
    liveSpotPrice: latestLivePricing.liveSpotPrice,
    liveBoxPriceSell: latestLivePricing.liveBoxPriceSell,
    livePackPrice: latestLivePricing.livePackPrice,
    currentLivePricingVersion: latestLivePricing.version
  });

  const shouldApply = currentLiveHash === baselineHash && currentLiveHash !== latestHash;
  if (shouldApply) {
    applyLivePricingSnapshot(app, latestLivePricing);
  }

  livePricingBaselineHashes.set(
    app as object,
    currentLiveHash === baselineHash ? latestHash : baselineHash
  );
  return shouldApply;
}

export async function pollAuthoritativeLotEntities(_app: unknown): Promise<void> {
  // Polling is intentionally disabled. Workspace freshness uses websockets,
  // and personal mode stays local-authoritative.
}

export function startLotEntityPolling(_app: unknown): void {
  // Polling is intentionally disabled.
}

export function refreshLotEntityPolling(_app: unknown): void {
  // Polling is intentionally disabled.
}

export function stopLotEntityPolling(_app: unknown): void {
  // Polling is intentionally disabled.
}

