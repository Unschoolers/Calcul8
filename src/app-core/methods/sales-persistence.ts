import type { Sale } from "../../types/app.ts";
import type { PersistenceOutcome } from "../shared/persistence-outcomes.ts";
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
): Promise<PersistenceOutcome> {
  const lotId = params.lotId;
  if (!lotId) return Promise.resolve({ kind: "skipped", reason: "no-lot" });
  if (!deps.canUseAuthoritativeApi()) return Promise.resolve({ kind: "skipped", reason: "unavailable" });
  const isCurrentScope = captureWorkspaceScopeGuard(context);
  const initialSales = [...context.sales];

  return (async (): Promise<PersistenceOutcome> => {
    const mutationState = getSaleMutationState(context, lotId);
    if (mutationState.isSavingSale) {
      return { kind: "skipped", reason: "duplicate" };
    }
    mutationState.isSavingSale = true;
    try {
      const savedSale = await deps.saveSale(context, lotId, params.pendingSale, params.baseVersion);
      if (!isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
      const sales = upsertById(
        context.currentLotId === lotId ? context.sales : getRootLotSales(context, lotId) ?? initialSales,
        savedSale,
        params.editingSaleId != null ? [params.editingSaleId] : []
      );
      replaceRootLotSales(context, lotId, sales);
      try {
        deps.cacheSales(context, lotId, sales);
        persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(sales));
      } catch (error) {
        throw new CachePersistenceError(error);
      }
      if (context.currentLotId === lotId) {
        context.cancelSale();
        deps.refreshCharts(context);
      }
      return { kind: "confirmed", persistence: "cloud", cache: "saved", cloud: "confirmed" };
    } catch (error) {
      if (!isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
      if (error instanceof SalesLiveApiError && error.status === 409) {
        const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
        if (!isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
        if (latestSales) {
          replaceRootLotSales(context, lotId, latestSales);
          try {
            deps.cacheSales(context, lotId, latestSales);
            persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(latestSales));
          } catch (error) {
            throw new CachePersistenceError(error);
          }
        }
        if (context.currentLotId === lotId) {
          context.cancelSale();
          deps.refreshCharts(context);
        }
        return { kind: "conflict", latestState: latestSales ? "loaded" : "unavailable" };
      }
      return {
        kind: "failure",
        error,
        stage: error instanceof CachePersistenceError ? "cache" : "cloud",
        ...(error instanceof CachePersistenceError ? { cloudConfirmed: true as const } : {})
      };
    } finally {
      mutationState.isSavingSale = false;
      mutationState.release();
    }
  })();
}

class CachePersistenceError extends Error {
  constructor(error: unknown) {
    super("Cloud save was confirmed, but the local sales cache could not be updated.");
    this.name = "CachePersistenceError";
    Object.defineProperty(this, "cause", { value: error, configurable: true });
  }
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
    saveLocalSales(context: SalesPersistenceContext): Promise<PersistenceOutcome>;
    refreshCharts(context: SalesChartRefreshContext): void;
    saveAuthoritatively(context: SalesPersistenceContext, request: {
      lotId: number | null;
      pendingSale: Sale;
      editingSaleId: number | null;
      baseVersion: number;
    }): Promise<PersistenceOutcome>;
  } = {
    canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
    persistLocally: persistSaleLocally,
    saveLocalSales: (context) => context.saveSalesToStorage(),
    refreshCharts: refreshChartsForCurrentTab,
    saveAuthoritatively: saveSaleAuthoritatively
  }
): Promise<PersistenceOutcome> {
  if (!params.lotId || !deps.canUseAuthoritativeApi()) {
    return (async (): Promise<PersistenceOutcome> => {
      try {
        deps.persistLocally(context, params.pendingSale, params.editingIndex);
        const localOutcome = await deps.saveLocalSales(context);
        if (localOutcome.kind !== "confirmed") return localOutcome;
        context.cancelSale();
        deps.refreshCharts(context);
        return {
          kind: "confirmed",
          persistence: "local",
          cache: "saved",
          cloud: typeof navigator !== "undefined" && navigator.onLine === false ? "skipped-offline" : "unavailable"
        };
      } catch (error) {
        return { kind: "failure", error, stage: "local" };
      }
    })();
  }

  return deps.saveAuthoritatively(context, {
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
): Promise<PersistenceOutcome> {
  return new Promise((resolve) => context.askConfirmation(
    {
      title: "Delete Sale?",
      text: "This action cannot be undone.",
      color: "error"
    },
    () => {
      const currentLotId = context.currentLotId;
      const sale = context.sales.find((entry) => entry.id === saleId) ?? null;
      if (!currentLotId || !sale || !deps.canUseAuthoritativeApi()) {
        try {
          context.sales = removeById(context.sales, saleId);
          deps.refreshCharts(context);
          resolve({
            kind: "confirmed",
            persistence: "local",
            cache: "saved",
            cloud: typeof navigator !== "undefined" && navigator.onLine === false ? "skipped-offline" : "unavailable"
          });
        } catch (error) {
          resolve({ kind: "failure", error, stage: "local" });
        }
        return;
      }
      const lotId = currentLotId;
      const isCurrentScope = captureWorkspaceScopeGuard(context);
      const initialSales = [...context.sales];

      void (async () => {
        const mutationState = getSaleMutationState(context, lotId);
        if (mutationState.deletingSaleIds.has(saleId)) {
          resolve({ kind: "skipped", reason: "duplicate" });
          return;
        }
        mutationState.deletingSaleIds.add(saleId);
        try {
          await deps.deleteSale(context, lotId, saleId, sale.version ?? 0);
          if (!isCurrentScope()) {
            resolve({ kind: "skipped", reason: "stale-scope" });
            return;
          }
          const sales = removeById(
            context.currentLotId === lotId ? context.sales : getRootLotSales(context, lotId) ?? initialSales,
            saleId
          );
          replaceRootLotSales(context, lotId, sales);
          try {
            deps.cacheSales(context, lotId, sales);
            persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(sales));
          } catch (error) {
            throw new CachePersistenceError(error);
          }
          if (context.currentLotId === lotId) deps.refreshCharts(context);
          resolve({ kind: "confirmed", persistence: "cloud", cache: "saved", cloud: "confirmed" });
        } catch (error) {
          if (!isCurrentScope()) {
            resolve({ kind: "skipped", reason: "stale-scope" });
            return;
          }
          if (error instanceof SalesLiveApiError && error.status === 409) {
            const latestSales = await deps.fetchSales(context, lotId).catch(() => null);
            if (!isCurrentScope()) {
              resolve({ kind: "skipped", reason: "stale-scope" });
              return;
            }
            if (latestSales) {
              replaceRootLotSales(context, lotId, latestSales);
              deps.cacheSales(context, lotId, latestSales);
              persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(latestSales));
            }
            resolve({ kind: "conflict", latestState: latestSales ? "loaded" : "unavailable" });
            return;
          }
          resolve({
            kind: "failure",
            error,
            stage: error instanceof CachePersistenceError ? "cache" : "cloud",
            ...(error instanceof CachePersistenceError ? { cloudConfirmed: true as const } : {})
          });
        } finally {
          mutationState.deletingSaleIds.delete(saleId);
          mutationState.release();
        }
      })();
    }
  ));
}

