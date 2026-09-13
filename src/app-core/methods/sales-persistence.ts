import type { Sale } from "../../types/app.ts";
import type {
  SalesAuthoritativePersistenceContext,
  SalesChartRefreshContext,
  SalesLocalMutationContext,
  SalesPersistenceContext
} from "../context/commerce.ts";
import { removeById, upsertById } from "../shared/collection-updaters.ts";
import { getRootLotSales, replaceRootLotSales } from "../shared/sales-root-state.ts";
import { captureWorkspaceScopeGuard, getWorkspaceScopeRevision, resolveWorkspaceScopeContext } from "../workspace-scope.ts";
import { canUseAuthoritativeSalesLiveApi, SalesLiveApiError } from "./entity-api-shared.ts";
import { cacheAuthoritativeSales, deleteAuthoritativeSale, fetchAuthoritativeSales, saveAuthoritativeSale } from "./lot-sales-api.ts";
import { buildLotSalesSyncMetaFromSales, persistStoredLotSalesSyncMeta } from "./sales-freshness.ts";
import { refreshChartsForCurrentTab } from "./sales-ui-helpers.ts";

type SaleMutationState = {
  isSavingSale: boolean;
  deletingSaleIds: Set<number>;
  release(): void;
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

const saleMutationStateByContext = new WeakMap<object, Map<string, SaleMutationState>>();

function getSaleMutationState(context: SalesPersistenceContext, lotId: number): SaleMutationState {
  let states = saleMutationStateByContext.get(context);
  if (!states) {
    states = new Map();
    saleMutationStateByContext.set(context, states);
  }
  const key = JSON.stringify([context.googleAuthEpoch, getWorkspaceScopeRevision(context), resolveWorkspaceScopeContext(context).scopeKey, lotId]);
  let state = states.get(key);
  if (!state) {
    state = {
      isSavingSale: false,
      deletingSaleIds: new Set<number>(),
      release() {
        if (!this.isSavingSale && this.deletingSaleIds.size === 0) states.delete(key);
      }
    };
    states.set(key, state);
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
  const isCurrentScope = captureWorkspaceScopeGuard(context);
  const initialSales = [...context.sales];

  void (async () => {
    const mutationState = getSaleMutationState(context, lotId);
    if (mutationState.isSavingSale) {
      return;
    }
    mutationState.isSavingSale = true;
    try {
      const savedSale = await deps.saveSale(context, lotId, params.pendingSale, params.baseVersion);
      if (!isCurrentScope()) return;
      const sales = upsertById(
        context.currentLotId === lotId ? context.sales : getRootLotSales(context, lotId) ?? initialSales,
        savedSale,
        params.editingSaleId != null ? [params.editingSaleId] : []
      );
      replaceRootLotSales(context, lotId, sales);
      deps.cacheSales(context, lotId, sales);
      persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(sales));
      if (context.currentLotId === lotId) {
        context.cancelSale();
        deps.refreshCharts(context);
      }
    } catch (error) {
      if (!isCurrentScope()) return;
      if (error instanceof SalesLiveApiError && error.status === 409) {
        const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
        if (!isCurrentScope()) return;
        if (latestSales) {
          replaceRootLotSales(context, lotId, latestSales);
          deps.cacheSales(context, lotId, latestSales);
          persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(latestSales));
        }
        if (context.currentLotId === lotId) {
          context.cancelSale();
          deps.refreshCharts(context);
          context.notify("Sales changed in the cloud. Pulled latest sales and canceled your save.", "warning");
        }
        return;
      }
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to save sale.";
      if (context.currentLotId === lotId) context.notify(message, "error");
    } finally {
      mutationState.isSavingSale = false;
      mutationState.release();
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
      const isCurrentScope = captureWorkspaceScopeGuard(context);
      const initialSales = [...context.sales];

      void (async () => {
        const mutationState = getSaleMutationState(context, lotId);
        if (mutationState.deletingSaleIds.has(saleId)) {
          return;
        }
        mutationState.deletingSaleIds.add(saleId);
        try {
          await deps.deleteSale(context, lotId, saleId, sale.version ?? 0);
          if (!isCurrentScope()) return;
          const sales = removeById(
            context.currentLotId === lotId ? context.sales : getRootLotSales(context, lotId) ?? initialSales,
            saleId
          );
          replaceRootLotSales(context, lotId, sales);
          deps.cacheSales(context, lotId, sales);
          persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(sales));
          if (context.currentLotId === lotId) {
            context.notify("Sale deleted", "info");
            deps.refreshCharts(context);
          }
        } catch (error) {
          if (!isCurrentScope()) return;
          if (error instanceof SalesLiveApiError && error.status === 409) {
            const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
            if (!isCurrentScope()) return;
            if (latestSales) {
              replaceRootLotSales(context, lotId, latestSales);
              deps.cacheSales(context, lotId, latestSales);
              persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(latestSales));
            }
            if (context.currentLotId === lotId) {
              context.notify("Sales changed in the cloud. Pulled latest sales instead of deleting.", "warning");
            }
            return;
          }
          const message = error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to delete sale.";
          if (context.currentLotId === lotId) context.notify(message, "error");
        } finally {
          mutationState.deletingSaleIds.delete(saleId);
          mutationState.release();
        }
      })();
    }
  );
}

