import type { AppState, Sale } from "../../types/app.ts";

export type RootSalesStateContext = object & Partial<Pick<AppState, "salesByLotId" | "currentLotId" | "sales">>;

function ensureRootSalesMap(context: RootSalesStateContext): Map<number, Sale[]> {
  const existing = context.salesByLotId;
  if (existing instanceof Map) {
    return existing;
  }
  const next = new Map<number, Sale[]>();
  context.salesByLotId = next;
  return next;
}

export function resetRootSalesState(context: RootSalesStateContext): void {
  context.salesByLotId = new Map<number, Sale[]>();
}

export function getRootLotSales(context: RootSalesStateContext, lotId: number): Sale[] | null {
  const salesByLotId = context.salesByLotId;
  if (!(salesByLotId instanceof Map) || !salesByLotId.has(lotId)) {
    return null;
  }
  return [...(salesByLotId.get(lotId) ?? [])];
}

export function replaceRootLotSales(context: RootSalesStateContext, lotId: number, sales: Sale[]): void {
  const nextSales = [...sales];
  ensureRootSalesMap(context).set(lotId, nextSales);
  if (context.currentLotId === lotId) {
    context.sales = [...nextSales];
  }
}

export function cacheRootLotSales(context: RootSalesStateContext, lotId: number, sales: Sale[]): void {
  ensureRootSalesMap(context).set(lotId, [...sales]);
}
