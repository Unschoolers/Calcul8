import type { LivePricingPayload } from "../context/commerce.ts";
import type { WorkspaceScopeType } from "../../types/app.ts";
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
import { getWorkspaceRealtimeApplyRevision } from "./ui/workspace/workspace-realtime-state.ts";

type LivePricingResponse = {
  livePricing?: object | null;
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

/** Captured scope keeps a delayed request bound to the workspace it was queued for. */
export type LivePricingRequestOptions = {
  scope?: {
    scopeType: WorkspaceScopeType;
    workspaceId: string | null;
  };
  isRequestCurrent?: () => boolean;
};

function requestScope(app: ScopedApiApp, options?: LivePricingRequestOptions): Pick<ScopedApiApp, "activeScopeType" | "activeWorkspaceId"> {
  if (options?.scope) {
    return {
      activeScopeType: options.scope.scopeType,
      activeWorkspaceId: options.scope.workspaceId
    };
  }
  return {
    activeScopeType: app.activeScopeType,
    activeWorkspaceId: app.activeWorkspaceId
  };
}

export function normalizeLivePricing<Value>(value: Value): LotLivePricingRecord | null {
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
  lotId: number,
  options?: LivePricingRequestOptions
): Promise<LotLivePricingRecord | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;
  const scope = requestScope(app, options);
  const realtimeRevision = getWorkspaceRealtimeApplyRevision(app as object);
  const isRequestCurrent = () => getWorkspaceRealtimeApplyRevision(app as object) === realtimeRevision
    && (options?.isRequestCurrent?.() ?? true);

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/live-pricing${getScopeQuery(scope)}`,
    {
      method: "GET"
    },
    "Failed to load live pricing.",
    { isRequestCurrent }
  ) as LivePricingResponse | null;

  if (!isRequestCurrent()) return null;
  return normalizeLivePricing(body?.livePricing);
}

export async function saveAuthoritativeLivePricing(
  app: ScopedApiApp,
  lotId: number,
  pricing: LivePricingPayload,
  options?: LivePricingRequestOptions
): Promise<LotLivePricingRecord> {
  const scope = requestScope(app, options);
  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/live-pricing`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(scope),
        livePackPrice: pricing.livePackPrice,
        liveBoxPriceSell: pricing.liveBoxPriceSell,
        liveSpotPrice: pricing.liveSpotPrice,
        baseVersion: pricing.currentLivePricingVersion ?? 0,
        mutationId: createMutationId("live-pricing")
      })
    },
    "Failed to save live pricing.",
    { isRequestCurrent: options?.isRequestCurrent }
  ) as LivePricingResponse | null;

  const livePricing = normalizeLivePricing(body?.livePricing);
  if (!livePricing) {
    throw new SalesLiveApiError(500, "Live pricing saved, but the API response was invalid.");
  }
  return livePricing;
}
