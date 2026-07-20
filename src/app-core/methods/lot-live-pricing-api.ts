import type { AppContext } from "../context-app.ts";
import { normalizeSyncLivePricingDto } from "./ui/sync/sync-contracts.ts";
import {
  canUseAuthoritativeSalesLiveApi,
  createMutationId,
  getScopeBody,
  getScopeQuery,
  requestJson,
  SalesLiveApiError,
  type ScopedApiApp
} from "./entity-api-shared.ts";

type LivePricingResponse = {
  livePricing?: unknown;
};

export type LotLivePricingRecord = {
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
  version: number | null;
  updatedAt?: string;
  updatedBy?: string;
  mutationId?: string;
};

export function normalizeLivePricing(value: unknown): LotLivePricingRecord | null {
  const livePricing = normalizeSyncLivePricingDto(value);
  if (!livePricing) return null;
  return {
    livePackPrice: livePricing.livePackPrice,
    liveBoxPriceSell: livePricing.liveBoxPriceSell,
    liveSpotPrice: livePricing.liveSpotPrice,
    version: livePricing.version ?? null,
    updatedAt: livePricing.updatedAt,
    updatedBy: livePricing.updatedBy,
    mutationId: livePricing.mutationId
  };
}

export async function fetchAuthoritativeLivePricing(
  app: ScopedApiApp,
  lotId: number
): Promise<LotLivePricingRecord | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/live-pricing${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to load live pricing."
  ) as LivePricingResponse | null;

  return normalizeLivePricing(body?.livePricing);
}

export async function saveAuthoritativeLivePricing(
  app: ScopedApiApp,
  lotId: number,
  pricing: Pick<AppContext, "livePackPrice" | "liveBoxPriceSell" | "liveSpotPrice" | "currentLivePricingVersion">
): Promise<LotLivePricingRecord> {
  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/live-pricing`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(app),
        livePackPrice: pricing.livePackPrice,
        liveBoxPriceSell: pricing.liveBoxPriceSell,
        liveSpotPrice: pricing.liveSpotPrice,
        baseVersion: pricing.currentLivePricingVersion ?? 0,
        mutationId: createMutationId("live-pricing")
      })
    },
    "Failed to save live pricing."
  ) as LivePricingResponse | null;

  const livePricing = normalizeLivePricing(body?.livePricing);
  if (!livePricing) {
    throw new SalesLiveApiError(500, "Live pricing saved, but the API response was invalid.");
  }
  return livePricing;
}
