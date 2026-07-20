import type { LotSalesSyncMeta, Sale } from "../../types/app.ts";
import type { SalesEntityContext } from "../context/commerce.ts";
import { persistSalesCacheToStorage } from "../shared/sales-cache-storage.ts";
import { replaceRootLotSales } from "../shared/sales-root-state.ts";
import { normalizeSyncSaleDto } from "./ui/sync/sync-contracts.ts";
import {
  canUseAuthoritativeSalesLiveApi,
  createMutationId,
  getScopeBody,
  getScopeQuery,
  requestJson,
  SalesLiveApiError,
  type ScopedApiApp
} from "./entity-api-shared.ts";

type SaleResponse = {
  sales?: unknown;
  sale?: unknown;
};

type AllSalesResponse = {
  salesByLot?: unknown;
};

type SalesSyncMetaResponse = {
  salesMeta?: unknown;
};

export function normalizeSale(value: unknown): Sale | null {
  const sale = normalizeSyncSaleDto(value);
  if (!sale) return null;
  return {
    id: sale.id,
    type: sale.type ?? "pack",
    quantity: sale.quantity ?? 0,
    packsCount: sale.packsCount ?? 0,
    singlesPurchaseEntryId: sale.singlesPurchaseEntryId,
    singlesItems: sale.singlesItems,
    price: sale.price ?? 0,
    priceIsTotal: sale.priceIsTotal,
    customer: sale.customer,
    memo: sale.memo,
    buyerShipping: sale.buyerShipping ?? 0,
    date: sale.date ?? "",
    version: sale.version,
    updatedAt: sale.updatedAt,
    updatedBy: sale.updatedBy,
    mutationId: sale.mutationId,
    linkedWheelId: sale.linkedWheelId,
    winningTierId: sale.winningTierId,
    costOfWinningTier: sale.costOfWinningTier,
    netRevenue: sale.netRevenue
  };
}

function normalizeSales(value: unknown): Sale[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSale(entry))
    .filter((entry): entry is Sale => entry != null);
}

function normalizeSalesByLot(value: unknown, requestedLotIds: number[] = []): Map<number, Sale[]> {
  const salesByLot = new Map<number, Sale[]>();
  for (const lotId of requestedLotIds) {
    salesByLot.set(lotId, []);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return salesByLot;
  }

  for (const [rawLotId, rawSales] of Object.entries(value as Record<string, unknown>)) {
    const lotId = Number(rawLotId);
    if (!Number.isFinite(lotId) || lotId <= 0) continue;
    salesByLot.set(lotId, normalizeSales(rawSales));
  }

  return salesByLot;
}

export function normalizeLotSalesSyncMeta(value: unknown): LotSalesSyncMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const activeCount = Number(candidate.activeCount);
  const latestUpdatedAt = candidate.latestUpdatedAt;

  if (!Number.isFinite(activeCount) || activeCount < 0) {
    return null;
  }

  return {
    activeCount: Math.floor(activeCount),
    latestUpdatedAt: typeof latestUpdatedAt === "string" && latestUpdatedAt.trim()
      ? latestUpdatedAt
      : null
  };
}

function persistSalesCache(
  app: Pick<SalesEntityContext, "getSalesStorageKey" | "activeScopeType" | "activeWorkspaceId">,
  lotId: number,
  sales: Sale[]
): void {
  try {
    persistSalesCacheToStorage(app, lotId, sales);
    replaceRootLotSales(app, lotId, sales);
  } catch {
    // Ignore cache write failures.
  }
}

export async function fetchAuthoritativeSales(
  app: SalesEntityContext,
  lotId: number
): Promise<Sale[] | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to load lot sales."
  ) as SaleResponse | null;

  const sales = normalizeSales(body?.sales);
  persistSalesCache(app, lotId, sales);
  return sales;
}

export async function fetchAuthoritativeLotSalesSyncMeta(
  app: ScopedApiApp,
  lotId: number
): Promise<LotSalesSyncMeta | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales-meta${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to load lot sales metadata."
  ) as SalesSyncMetaResponse | null;

  return normalizeLotSalesSyncMeta(body?.salesMeta);
}

export async function fetchAuthoritativeAllSales(
  app: SalesEntityContext,
  lotIds: number[] | null = null
): Promise<Map<number, Sale[]> | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;

  const normalizedLotIds = Array.from(new Set(
    (lotIds ?? [])
      .map((lotId) => Number(lotId))
      .filter((lotId) => Number.isFinite(lotId) && lotId > 0)
  ));
  const query = new URLSearchParams();
  if (app.activeScopeType === "workspace" && app.activeWorkspaceId) {
    query.set("workspaceId", app.activeWorkspaceId);
  }
  if (normalizedLotIds.length > 0) {
    query.set("lotIds", normalizedLotIds.join(","));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const body = await requestJson(
    app,
    `/sales${suffix}`,
    {
      method: "GET"
    },
    "Failed to load sales."
  ) as AllSalesResponse | null;

  const salesByLot = normalizeSalesByLot(body?.salesByLot, normalizedLotIds);
  for (const [lotId, sales] of salesByLot.entries()) {
    persistSalesCache(app, lotId, sales);
  }
  return salesByLot;
}

export async function saveAuthoritativeSale(
  app: ScopedApiApp,
  lotId: number,
  sale: Sale,
  baseVersion: number
): Promise<Sale> {
  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(app),
        sale,
        baseVersion,
        mutationId: createMutationId("sale")
      })
    },
    "Failed to save sale."
  ) as SaleResponse | null;

  const savedSale = normalizeSale(body?.sale);
  if (!savedSale) {
    throw new SalesLiveApiError(500, "Sale saved, but the API response was invalid.");
  }
  return savedSale;
}

export async function deleteAuthoritativeSale(
  app: ScopedApiApp,
  lotId: number,
  saleId: number,
  baseVersion: number
): Promise<void> {
  await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales/${encodeURIComponent(String(saleId))}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(app),
        baseVersion,
        mutationId: createMutationId("sale-delete")
      })
    },
    "Failed to delete sale."
  );
}

export function cacheAuthoritativeSales(
  app: Pick<SalesEntityContext, "getSalesStorageKey" | "activeScopeType" | "activeWorkspaceId">,
  lotId: number,
  sales: Sale[]
): void {
  persistSalesCache(app, lotId, sales);
}
