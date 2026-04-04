import type { Sale } from "../../types/app.ts";
import type { AppContext } from "../context-app.ts";
import { cacheAuthoritativeSales, canUseAuthoritativeSalesLiveApi, fetchAuthoritativeSales } from "./sales-live-api.ts";
import { refreshChartsForCurrentTab } from "./sales-ui-helpers.ts";

type PortfolioSalesHydrationState = {
  hydratingLotIds: Set<number>;
};

type HydrationDeps = {
  canUseAuthoritativeApi(): boolean;
  fetchSales(context: AppContext, lotId: number): Promise<Sale[] | null>;
  cacheSales(context: AppContext, lotId: number, sales: Sale[]): void;
  refreshCharts(context: AppContext): void;
};

const portfolioSalesHydrationStateByContext = new WeakMap<object, PortfolioSalesHydrationState>();

function getPortfolioSalesHydrationState(context: object): PortfolioSalesHydrationState {
  let state = portfolioSalesHydrationStateByContext.get(context);
  if (!state) {
    state = {
      hydratingLotIds: new Set<number>()
    };
    portfolioSalesHydrationStateByContext.set(context, state);
  }
  return state;
}

function hasPersistedSalesCache(context: Pick<AppContext, "getSalesCacheEntry">, lotId: number): boolean {
  return context.getSalesCacheEntry(lotId).status === "loaded";
}

export function hydrateMissingPortfolioSales(
  context: AppContext,
  options: {
    force?: boolean;
  } = {},
  deps: HydrationDeps = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    fetchSales: fetchAuthoritativeSales,
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

