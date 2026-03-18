import type { Sale } from "../../../types/app.ts";
import type { AppContext } from "../../context.ts";
import {
  cacheAuthoritativeSales,
  canUseAuthoritativeSalesLiveApi,
  fetchAuthoritativeLivePricing,
  fetchAuthoritativeSales,
  type LotLivePricingRecord
} from "../sales-live-api.ts";

const LOT_ENTITY_POLL_INTERVAL_MS = 30_000;

type LotEntityPollingApp = Pick<
  AppContext,
  | "currentLotId"
  | "currentTab"
  | "sales"
  | "liveSpotPrice"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "currentLivePricingVersion"
  | "isOffline"
>;

const lotEntityPollingIntervals = new WeakMap<object, number>();
const lotEntityPollingInFlight = new WeakSet<object>();
const livePricingBaselineHashes = new WeakMap<object, string | null>();

function shouldPollSales(app: Pick<LotEntityPollingApp, "currentTab">): boolean {
  return app.currentTab === "live" || app.currentTab === "sales" || app.currentTab === "portfolio";
}

function shouldPollLivePricing(app: Pick<LotEntityPollingApp, "currentTab">): boolean {
  return app.currentTab === "live" || app.currentTab === "portfolio";
}

function shouldRunLotEntityPolling(app: LotEntityPollingApp): boolean {
  if (app.isOffline || !app.currentLotId || !canUseAuthoritativeSalesLiveApi()) {
    return false;
  }

  return shouldPollSales(app) || shouldPollLivePricing(app);
}

function createSalesHash(sales: Sale[]): string {
  return JSON.stringify(
    sales.map((sale) => ({
      id: sale.id,
      type: sale.type,
      quantity: sale.quantity,
      packsCount: sale.packsCount,
      singlesPurchaseEntryId: sale.singlesPurchaseEntryId ?? null,
      singlesItems: Array.isArray(sale.singlesItems)
        ? sale.singlesItems.map((line) => ({
          singlesPurchaseEntryId: line.singlesPurchaseEntryId ?? null,
          quantity: line.quantity,
          price: line.price
        }))
        : null,
      price: sale.price,
      priceIsTotal: sale.priceIsTotal === true,
      memo: sale.memo ?? "",
      buyerShipping: sale.buyerShipping,
      date: sale.date,
      version: sale.version ?? null
    }))
  );
}

export function createLivePricingPollingHash(
  pricing: Pick<LotEntityPollingApp, "liveSpotPrice" | "liveBoxPriceSell" | "livePackPrice" | "currentLivePricingVersion">
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
  pricing: Pick<LotEntityPollingApp, "liveSpotPrice" | "liveBoxPriceSell" | "livePackPrice" | "currentLivePricingVersion"> | null
): void {
  livePricingBaselineHashes.set(app, pricing ? createLivePricingPollingHash(pricing) : null);
}

function applyLivePricingSnapshot(app: LotEntityPollingApp, livePricing: LotLivePricingRecord): void {
  app.liveSpotPrice = livePricing.liveSpotPrice;
  app.liveBoxPriceSell = livePricing.liveBoxPriceSell;
  app.livePackPrice = livePricing.livePackPrice;
  app.currentLivePricingVersion = livePricing.version;
}

export async function pollAuthoritativeLotEntities(app: LotEntityPollingApp): Promise<void> {
  if (!shouldRunLotEntityPolling(app)) {
    return;
  }

  if (lotEntityPollingInFlight.has(app as object)) {
    return;
  }

  lotEntityPollingInFlight.add(app as object);
  const activeLotId = app.currentLotId;
  if (activeLotId == null) {
    lotEntityPollingInFlight.delete(app as object);
    return;
  }

  try {
    const [latestSales, latestLivePricing] = await Promise.all([
      shouldPollSales(app)
        ? fetchAuthoritativeSales(app as never, activeLotId)
        : Promise.resolve(null),
      shouldPollLivePricing(app)
        ? fetchAuthoritativeLivePricing(app as never, activeLotId)
        : Promise.resolve(null)
    ]);

    if (app.currentLotId !== activeLotId) {
      return;
    }

    if (latestSales) {
      const currentSalesHash = createSalesHash(Array.isArray(app.sales) ? app.sales : []);
      const nextSalesHash = createSalesHash(latestSales);
      if (currentSalesHash !== nextSalesHash) {
        app.sales = latestSales;
        cacheAuthoritativeSales(app as never, activeLotId, latestSales);
      }
    }

    const currentLiveHash = createLivePricingPollingHash(app);
    const baselineHash = livePricingBaselineHashes.get(app as object) ?? currentLiveHash;

    if (latestLivePricing) {
      const latestHash = createLivePricingPollingHash({
        liveSpotPrice: latestLivePricing.liveSpotPrice,
        liveBoxPriceSell: latestLivePricing.liveBoxPriceSell,
        livePackPrice: latestLivePricing.livePackPrice,
        currentLivePricingVersion: latestLivePricing.version
      });

      if (currentLiveHash === baselineHash && currentLiveHash !== latestHash) {
        applyLivePricingSnapshot(app, latestLivePricing);
      }

      livePricingBaselineHashes.set(
        app as object,
        currentLiveHash === baselineHash ? latestHash : baselineHash
      );
      return;
    }

    livePricingBaselineHashes.set(app as object, baselineHash);
  } finally {
    lotEntityPollingInFlight.delete(app as object);
  }
}

export function startLotEntityPolling(app: LotEntityPollingApp): void {
  if (!shouldRunLotEntityPolling(app)) {
    stopLotEntityPolling(app);
    return;
  }

  if (lotEntityPollingIntervals.has(app as object)) {
    return;
  }

  const intervalId = globalThis.setInterval(() => {
    void pollAuthoritativeLotEntities(app);
  }, LOT_ENTITY_POLL_INTERVAL_MS);
  lotEntityPollingIntervals.set(app as object, intervalId);
}

export function refreshLotEntityPolling(app: LotEntityPollingApp): void {
  if (shouldRunLotEntityPolling(app)) {
    startLotEntityPolling(app);
    return;
  }

  stopLotEntityPolling(app);
}

export function stopLotEntityPolling(app: object): void {
  const intervalId = lotEntityPollingIntervals.get(app);
  if (intervalId != null) {
    globalThis.clearInterval(intervalId);
    lotEntityPollingIntervals.delete(app);
  }
}
