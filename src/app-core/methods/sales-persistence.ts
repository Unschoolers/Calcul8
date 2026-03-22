import type { Sale } from "../../types/app.ts";
import type { AppContext } from "../context.ts";
import { removeById, upsertById } from "../shared/collection-updaters.ts";
import { cacheAuthoritativeSales, canUseAuthoritativeSalesLiveApi, deleteAuthoritativeSale, fetchAuthoritativeSales, SalesLiveApiError, saveAuthoritativeSale } from "./sales-live-api.ts";
import { refreshChartsForCurrentTab } from "./sales-ui-helpers.ts";

type SaleMutationState = {
  isSavingSale: boolean;
  deletingSaleIds: Set<number>;
};

type SaveAuthoritativeSaleDeps = {
  canUseAuthoritativeApi(): boolean;
  saveSale(context: AppContext, lotId: number, sale: Sale, baseVersion: number): Promise<Sale>;
  fetchSales(context: AppContext, lotId: number): Promise<Sale[] | null>;
  cacheSales(context: AppContext, lotId: number, sales: Sale[]): void;
  refreshCharts(context: AppContext): void;
};

type DeleteAuthoritativeSaleDeps = {
  canUseAuthoritativeApi(): boolean;
  deleteSale(context: AppContext, lotId: number, saleId: number, version: number): Promise<void>;
  fetchSales(context: AppContext, lotId: number): Promise<Sale[] | null>;
  cacheSales(context: AppContext, lotId: number, sales: Sale[]): void;
  refreshCharts(context: AppContext): void;
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
  context: Pick<AppContext, "sales" | "editingSale" | "cancelSale">,
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
  context: AppContext,
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
      context.cancelSale();
      deps.refreshCharts(context);
    } catch (error) {
      if (error instanceof SalesLiveApiError && error.status === 409) {
        const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
        if (latestSales) {
          context.sales = latestSales;
          deps.cacheSales(context, lotId, latestSales);
        }
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
  context: AppContext,
  params: {
    lotId: number | null;
    pendingSale: Sale;
    editingSaleId: number | null;
    editingIndex: number;
    baseVersion: number;
  },
  deps: {
    canUseAuthoritativeApi(): boolean;
    persistLocally(context: Pick<AppContext, "sales" | "editingSale" | "cancelSale">, sale: Sale, editingIndex: number): void;
    refreshCharts(context: AppContext): void;
    saveAuthoritatively(context: AppContext, request: {
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
  context: AppContext,
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
          context.notify("Sale deleted", "info");
          deps.refreshCharts(context);
        } catch (error) {
          if (error instanceof SalesLiveApiError && error.status === 409) {
            const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
            if (latestSales) {
              context.sales = latestSales;
              deps.cacheSales(context, lotId, latestSales);
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
