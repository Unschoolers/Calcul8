import type { Sale } from "../../types/app.ts";
import type {
  SalesAuthoritativePersistenceContext,
  SalesChartRefreshContext,
  SalesLocalMutationContext,
  SalesPersistenceContext
} from "../context/commerce.ts";
import { removeById, upsertById } from "../shared/collection-updaters.ts";
import { canUseAuthoritativeSalesLiveApi, SalesLiveApiError } from "./entity-api-shared.ts";
import { cacheAuthoritativeSales, deleteAuthoritativeSale, fetchAuthoritativeSales, saveAuthoritativeSale } from "./lot-sales-api.ts";
import { buildLotSalesSyncMetaFromSales, persistStoredLotSalesSyncMeta } from "./sales-freshness.ts";
import { refreshChartsForCurrentTab } from "./sales-ui-helpers.ts";

type SaleMutationState = {
  isSavingSale: boolean;
  deletingSaleIds: Set<number>;
};

type SaveAuthoritativeSaleDeps = {
  canUseAuthoritativeApi(): boolean;
  saveSale(context: SalesAuthoritativePersistenceContext, lotId: number, sale: Sale, baseVersion: number): Promise<Sale>;
  fetchSales(context: SalesAuthoritativePersistenceContext, lotId: number): Promise<Sale[] | null>;
  cacheSales(context: SalesAuthoritativePersistenceContext, lotId: number, sales: Sale[]): void;
  refreshCharts(context: SalesChartRefreshContext): void;
};

type DeleteAuthoritativeSaleDeps = {
  canUseAuthoritativeApi(): boolean;
  deleteSale(context: SalesAuthoritativePersistenceContext, lotId: number, saleId: number, version: number): Promise<void>;
  fetchSales(context: SalesAuthoritativePersistenceContext, lotId: number): Promise<Sale[] | null>;
  cacheSales(context: SalesAuthoritativePersistenceContext, lotId: number, sales: Sale[]): void;
  refreshCharts(context: SalesChartRefreshContext): void;
};

const saleMutationStateByContext = new WeakMap<object, SaleMutationState>();

function getSaleMutationState(context: object): SaleMutationState {
  let state = saleMutationStateByContext.get(context);
  if (!state) {
    state = {
      isSavingSale: false,
      deletingSaleIds: new Set<number>()
    };
    saleMutationStateByContext.set(context, state);
  }
  return state;
}

export function persistSaleLocally(
  context: SalesLocalMutationContext,
  sale: Sale,
  editingIndex: number
): void {
  if (context.editingSale) {
    const nextSales = [...context.sales];
    nextSales.splice(editingIndex, 1, sale);
    context.sales = nextSales;
  } else {
    context.sales = upsertById(context.sales, sale);
  }

  context.cancelSale();
}

export function saveSaleAuthoritatively(
  context: SalesPersistenceContext,
  params: {
    lotId: number | null;
    pendingSale: Sale;
    editingSaleId: number | null;
    baseVersion: number;
  },
  deps: SaveAuthoritativeSaleDeps = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    saveSale: saveAuthoritativeSale,
    fetchSales: fetchAuthoritativeSales,
    cacheSales: cacheAuthoritativeSales,
    refreshCharts: refreshChartsForCurrentTab
  }
): void {
  const lotId = params.lotId;
  if (!lotId || !deps.canUseAuthoritativeApi()) {
    return;
  }

  void (async () => {
    const mutationState = getSaleMutationState(context as object);
    if (mutationState.isSavingSale) {
      return;
    }
    mutationState.isSavingSale = true;
    try {
      const savedSale = await deps.saveSale(context, lotId, params.pendingSale, params.baseVersion);
      context.sales = upsertById(
        context.sales,
        savedSale,
        params.editingSaleId != null ? [params.editingSaleId] : []
      );
      deps.cacheSales(context, lotId, context.sales);
      persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(context.sales));
      context.cancelSale();
      deps.refreshCharts(context);
    } catch (error) {
      if (error instanceof SalesLiveApiError && error.status === 409) {
        const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
        if (latestSales) {
          context.sales = latestSales;
          deps.cacheSales(context, lotId, latestSales);
          persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(latestSales));
        }
        context.cancelSale();
        deps.refreshCharts(context);
        context.notify("Sales changed in the cloud. Pulled latest sales and canceled your save.", "warning");
        return;
      }
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to save sale.";
      context.notify(message, "error");
    } finally {
      mutationState.isSavingSale = false;
    }
  })();
}

export function saveSaleWithPersistence(
  context: SalesPersistenceContext,
  params: {
    lotId: number | null;
    pendingSale: Sale;
    editingSaleId: number | null;
    editingIndex: number;
    baseVersion: number;
  },
  deps: {
    canUseAuthoritativeApi(): boolean;
    persistLocally(context: SalesLocalMutationContext, sale: Sale, editingIndex: number): void;
    refreshCharts(context: SalesChartRefreshContext): void;
    saveAuthoritatively(context: SalesPersistenceContext, request: {
      lotId: number | null;
      pendingSale: Sale;
      editingSaleId: number | null;
      baseVersion: number;
    }): void;
  } = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    persistLocally: persistSaleLocally,
    refreshCharts: refreshChartsForCurrentTab,
    saveAuthoritatively: saveSaleAuthoritatively
  }
): void {
  if (!params.lotId || !deps.canUseAuthoritativeApi()) {
    deps.persistLocally(context, params.pendingSale, params.editingIndex);
    deps.refreshCharts(context);
    return;
  }

  deps.saveAuthoritatively(context, {
    lotId: params.lotId,
    pendingSale: params.pendingSale,
    editingSaleId: params.editingSaleId,
    baseVersion: params.baseVersion
  });
}

export function deleteSaleWithPersistence(
  context: SalesPersistenceContext,
  saleId: number,
  deps: DeleteAuthoritativeSaleDeps = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    deleteSale: deleteAuthoritativeSale,
    fetchSales: fetchAuthoritativeSales,
    cacheSales: cacheAuthoritativeSales,
    refreshCharts: refreshChartsForCurrentTab
  }
): void {
  context.askConfirmation(
    {
      title: "Delete Sale?",
      text: "This action cannot be undone.",
      color: "error"
    },
    () => {
      const currentLotId = context.currentLotId;
      const sale = context.sales.find((entry) => entry.id === saleId) ?? null;
      if (!currentLotId || !sale || !deps.canUseAuthoritativeApi()) {
        context.sales = removeById(context.sales, saleId);
        context.notify("Sale deleted", "info");
        deps.refreshCharts(context);
        return;
      }
      const lotId = currentLotId;

      void (async () => {
        const mutationState = getSaleMutationState(context as object);
        if (mutationState.deletingSaleIds.has(saleId)) {
          return;
        }
        mutationState.deletingSaleIds.add(saleId);
        try {
          await deps.deleteSale(context, lotId, saleId, sale.version ?? 0);
          context.sales = removeById(context.sales, saleId);
          deps.cacheSales(context, lotId, context.sales);
          persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(context.sales));
          context.notify("Sale deleted", "info");
          deps.refreshCharts(context);
        } catch (error) {
          if (error instanceof SalesLiveApiError && error.status === 409) {
            const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
            if (latestSales) {
              context.sales = latestSales;
              deps.cacheSales(context, lotId, latestSales);
              persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(latestSales));
            }
            context.notify("Sales changed in the cloud. Pulled latest sales instead of deleting.", "warning");
            return;
          }
          const message = error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to delete sale.";
          context.notify(message, "error");
        } finally {
          mutationState.deletingSaleIds.delete(saleId);
        }
      })();
    }
  );
}

