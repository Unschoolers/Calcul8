import type { Sale } from "../../types/app.ts";
import type { AppContext } from "../context-app.ts";
import {
  cacheAuthoritativeSales,
  canUseAuthoritativeSalesLiveApi,
  fetchAuthoritativeAllSales,
  fetchAuthoritativeSales
} from "./sales-live-api.ts";
import { refreshChartsForCurrentTab } from "./sales-ui-helpers.ts";

type PortfolioSalesHydrationState = {
  hydratingLotIds: Set<number>;
  queuedHydrationTimeoutId: number | null;
};

type HydrationDeps = {
  canUseAuthoritativeApi(): boolean;
  fetchSales(context: AppContext, lotId: number): Promise<Sale[] | null>;
  fetchSalesByLot?(context: AppContext, lotIds: number[]): Promise<Map<number, Sale[]> | null>;
  cacheSales(context: AppContext, lotId: number, sales: Sale[]): void;
  refreshCharts(context: AppContext): void;
};

const portfolioSalesHydrationStateByContext = new WeakMap<object, PortfolioSalesHydrationState>();

function getPortfolioSalesHydrationState(context: object): PortfolioSalesHydrationState {
  let state = portfolioSalesHydrationStateByContext.get(context);
  if (!state) {
    state = {
      hydratingLotIds: new Set<number>(),
      queuedHydrationTimeoutId: null
    };
    portfolioSalesHydrationStateByContext.set(context, state);
  }
  return state;
}

export function cancelQueuedPortfolioSalesHydration(context: object): void {
  const state = portfolioSalesHydrationStateByContext.get(context);
  if (!state || state.queuedHydrationTimeoutId == null) return;
  globalThis.clearTimeout(state.queuedHydrationTimeoutId);
  state.queuedHydrationTimeoutId = null;
}

function hasPersistedSalesCache(context: Pick<AppContext, "getSalesCacheEntry">, lotId: number): boolean {
  return context.getSalesCacheEntry(lotId).status === "loaded";
}

export function queuePortfolioSalesHydration(
  context: AppContext,
  options: {
    force?: boolean;
  } = {},
  deps: HydrationDeps = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    fetchSales: fetchAuthoritativeSales,
    fetchSalesByLot: fetchAuthoritativeAllSales,
    cacheSales: cacheAuthoritativeSales,
    refreshCharts: refreshChartsForCurrentTab
  },
  delayMs = 0
): void {
  const state = getPortfolioSalesHydrationState(context as object);
  cancelQueuedPortfolioSalesHydration(context as object);
  state.queuedHydrationTimeoutId = globalThis.setTimeout(() => {
    state.queuedHydrationTimeoutId = null;
    hydrateMissingPortfolioSales(context, options, deps);
  }, Math.max(0, Math.floor(Number(delayMs) || 0))) as unknown as number;
}

export function hydrateMissingPortfolioSales(
  context: AppContext,
  options: {
    force?: boolean;
  } = {},
  deps: HydrationDeps = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    fetchSales: fetchAuthoritativeSales,
    fetchSalesByLot: fetchAuthoritativeAllSales,
    cacheSales: cacheAuthoritativeSales,
    refreshCharts: refreshChartsForCurrentTab
  }
): void {
  if (context.currentTab !== "portfolio" || context.isOffline || !deps.canUseAuthoritativeApi()) {
    return;
  }

  const currentLotId = context.currentLotId;
  const selectedLotIdSet = new Set(
    Array.isArray(context.portfolioSelectedLotIds) && context.portfolioSelectedLotIds.length > 0
      ? context.portfolioSelectedLotIds
      : context.lots.map((lot) => lot.id)
  );
  const hydrationState = getPortfolioSalesHydrationState(context as object);
  const missingLotIds = context.lots
    .filter((lot) => selectedLotIdSet.has(lot.id))
    .map((lot) => lot.id)
    .filter((lotId) =>
      lotId !== currentLotId &&
      !hydrationState.hydratingLotIds.has(lotId) &&
      (options.force === true || !hasPersistedSalesCache(context, lotId))
    );

  if (missingLotIds.length === 0) return;

  for (const lotId of missingLotIds) {
    hydrationState.hydratingLotIds.add(lotId);
  }

  void (async () => {
    let shouldRefresh = false;
    try {
      if (typeof deps.fetchSalesByLot === "function") {
        try {
          const salesByLot = await deps.fetchSalesByLot(context, missingLotIds);
          if (salesByLot) {
            for (const lotId of missingLotIds) {
              const sales = salesByLot.get(lotId);
              if (!Array.isArray(sales)) continue;
              deps.cacheSales(context, lotId, sales);
              shouldRefresh = true;
            }
          }
        } catch {
          // Ignore background hydration failures and keep the current portfolio render.
        }
      } else {
        await Promise.all(
          missingLotIds.map(async (lotId) => {
            try {
              const sales = await deps.fetchSales(context, lotId);
              if (Array.isArray(sales)) {
                deps.cacheSales(context, lotId, sales);
                shouldRefresh = true;
              }
            } catch {
              // Ignore background hydration failures and keep the current portfolio render.
            } finally {
              hydrationState.hydratingLotIds.delete(lotId);
            }
          })
        );
      }
    } finally {
      for (const lotId of missingLotIds) {
        hydrationState.hydratingLotIds.delete(lotId);
      }
      if (shouldRefresh) {
        context.salesCacheEpoch += 1;
        deps.refreshCharts(context);
      }
    }
  })();
}
