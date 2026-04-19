import type { LotSalesCacheEntry, Sale } from "../../types/app.ts";
import {
  getRootLotSales,
  type RootSalesStateContext
} from "./sales-root-state.ts";

export type LotSalesAccessContext = RootSalesStateContext & {
  getSalesCacheEntry?: (lotId: number) => LotSalesCacheEntry;
  loadSalesForLotId?: (lotId: number) => Sale[];
};

export type AllLotSalesAccessContext = LotSalesAccessContext & {
  getAllSalesByLotId?: (lotIds?: number[] | null) => Map<number, Sale[]>;
};

export function getLotSalesFromAccessContext(
  context: LotSalesAccessContext,
  lotId: number
): Sale[] {
  if (context.currentLotId === lotId && Array.isArray(context.sales)) {
    return [...context.sales];
  }

  const inMemorySales = getRootLotSales(context, lotId);
  if (inMemorySales) {
    return inMemorySales;
  }

  const cacheEntry = context.getSalesCacheEntry?.(lotId);
  if (cacheEntry) {
    return [...cacheEntry.sales];
  }

  return [...(context.loadSalesForLotId?.(lotId) ?? [])];
}

export function getSalesByLotIdFromAccessContext(
  context: AllLotSalesAccessContext,
  lotIds: number[]
): Map<number, Sale[]> {
  if (typeof context.getAllSalesByLotId === "function") {
    return context.getAllSalesByLotId(lotIds);
  }

  const uniqueLotIds = Array.from(new Set(
    lotIds
      .map((lotId) => Number(lotId))
      .filter((lotId) => Number.isFinite(lotId) && lotId > 0)
  ));

  return new Map(
    uniqueLotIds.map((lotId) => [
      lotId,
      getLotSalesFromAccessContext(context, lotId)
    ] as const)
  );
}
