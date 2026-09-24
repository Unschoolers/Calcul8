import type { Lot } from "../../types/app.ts";
import type { CommerceMethodState, SalesEntityContext } from "../context/commerce.ts";
import type { AppState } from "../../types/app.ts";
import { captureWorkspaceScopeGuard, getActiveStorageScope } from "../workspace-scope.ts";
import { cacheAuthoritativeSales, fetchAuthoritativeAllSales } from "./lot-sales-api.ts";
import { canUseAuthoritativeSalesLiveApi } from "./entity-api-shared.ts";

type WhatnotHydrationContext = Pick<AppState,
  "lots" | "activeScopeType" | "activeWorkspaceId" | "isOffline" | "salesCacheEpoch" | "googleAuthEpoch" | "hasProAccess"
> & Pick<CommerceMethodState, "getSalesCacheEntry">;

type HydrationState = { attemptedKey: string | null; inFlightKey: string | null };
const hydrationStates = new WeakMap<object, HydrationState>();

export function hydrateMissingWhatnotScopeSales(
  context: WhatnotHydrationContext,
  deps = {
    canUseApi: canUseAuthoritativeSalesLiveApi,
    fetchAll: fetchAuthoritativeAllSales,
    cache: cacheAuthoritativeSales
  }
): void {
  if (context.isOffline || !deps.canUseApi()) return;
  const lotIds = context.lots.map((lot: Lot) => lot.id);
  const missing = lotIds.filter((id) => context.getSalesCacheEntry(id).status !== "loaded");
  if (!missing.length) return;
  const state = hydrationStates.get(context as object) ?? { attemptedKey: null, inFlightKey: null };
  hydrationStates.set(context as object, state);
  const scope = getActiveStorageScope(context);
  const key = JSON.stringify([scope, missing.slice().sort((a, b) => a - b)]);
  if (state.attemptedKey === key || state.inFlightKey === key) return;
  state.inFlightKey = key;
  const isCurrentScope = captureWorkspaceScopeGuard(context);
  void deps.fetchAll(context as unknown as SalesEntityContext, missing).then((salesByLot) => {
    if (!salesByLot || !isCurrentScope() || !missing.every((id) => Array.isArray(salesByLot.get(id)))) return;
    for (const id of missing) {
      const sales = salesByLot.get(id);
      if (Array.isArray(sales)) deps.cache(context as unknown as SalesEntityContext, id, sales);
    }
    context.salesCacheEpoch += 1;
    state.attemptedKey = key;
  }).catch(() => {
    // A later lifecycle event can retry; failed background fetches remain incomplete.
  }).finally(() => {
    if (state.inFlightKey === key) state.inFlightKey = null;
  });
}
