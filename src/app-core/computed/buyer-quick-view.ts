import type { Lot, Sale } from "../../types/app.ts";

export interface BuyerLotPurchaseSummary {
  lotId: number;
  lotName: string;
  purchaseCount: number;
  totalSpent: number;
  lastPurchaseDate: string | null;
  isCurrentLot: boolean;
}

export interface BuyerQuickViewSummary {
  username: string;
  normalizedKey: string;
  currentLotId: number | null;
  totalSpentForCurrentLot: number;
  totalSpentAllLots: number;
  purchasesForCurrentLot: number;
  purchasesAllLots: number;
  lastPurchaseDate: string | null;
  groupedByLot: BuyerLotPurchaseSummary[];
}

export interface BuildBuyerQuickViewSummaryParams {
  buyerName: string;
  lots: Lot[];
  salesByLotId: Map<number, Sale[]>;
  currentLotId?: number | null;
}

export function normalizeBuyerKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function normalizeDisplayName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function saleGrossBuyerSpend(sale: Sale): number {
  const price = Math.max(0, Number(sale.price) || 0);
  if (sale.priceIsTotal) return price;
  return price * Math.max(1, Number(sale.quantity) || 1);
}

function latestDate(left: string | null, right: string): string {
  if (!left) return right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return rightTime > leftTime ? right : left;
  }
  return right > left ? right : left;
}

function lotNameById(lots: Lot[]): Map<number, string> {
  return new Map(lots.map((lot) => [Number(lot.id), String(lot.name || "").trim() || `Lot ${lot.id}`]));
}

export function buildBuyerQuickViewSummary(params: BuildBuyerQuickViewSummaryParams): BuyerQuickViewSummary | null {
  const normalizedKey = normalizeBuyerKey(params.buyerName);
  if (!normalizedKey) return null;

  const currentLotId = Number.isFinite(Number(params.currentLotId)) && Number(params.currentLotId) > 0
    ? Number(params.currentLotId)
    : null;
  const namesById = lotNameById(Array.isArray(params.lots) ? params.lots : []);
  const grouped = new Map<number, BuyerLotPurchaseSummary>();
  let totalSpentAllLots = 0;
  let purchasesAllLots = 0;
  let lastPurchaseDate: string | null = null;

  for (const [rawLotId, rawSales] of params.salesByLotId instanceof Map ? params.salesByLotId.entries() : []) {
    const lotId = Number(rawLotId);
    if (!Number.isFinite(lotId)) continue;
    const sales = Array.isArray(rawSales) ? rawSales : [];

    for (const sale of sales) {
      if (normalizeBuyerKey(sale.customer) !== normalizedKey) continue;
      const spend = saleGrossBuyerSpend(sale);
      const current = grouped.get(lotId) ?? {
        lotId,
        lotName: namesById.get(lotId) ?? `Lot ${lotId}`,
        purchaseCount: 0,
        totalSpent: 0,
        lastPurchaseDate: null,
        isCurrentLot: currentLotId === lotId
      };
      current.purchaseCount += 1;
      current.totalSpent += spend;
      current.lastPurchaseDate = latestDate(current.lastPurchaseDate, sale.date);
      grouped.set(lotId, current);

      totalSpentAllLots += spend;
      purchasesAllLots += 1;
      lastPurchaseDate = latestDate(lastPurchaseDate, sale.date);
    }
  }

  if (purchasesAllLots <= 0) return null;

  const currentLot = currentLotId == null ? null : grouped.get(currentLotId) ?? null;
  const groupedByLot = [...grouped.values()].sort((left, right) => {
    if (left.isCurrentLot !== right.isCurrentLot) return left.isCurrentLot ? -1 : 1;
    const leftDate = Date.parse(left.lastPurchaseDate ?? "");
    const rightDate = Date.parse(right.lastPurchaseDate ?? "");
    if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
      return rightDate - leftDate;
    }
    if (right.totalSpent !== left.totalSpent) return right.totalSpent - left.totalSpent;
    return left.lotName.localeCompare(right.lotName);
  });

  return {
    username: normalizeDisplayName(params.buyerName),
    normalizedKey,
    currentLotId,
    totalSpentForCurrentLot: currentLot?.totalSpent ?? 0,
    totalSpentAllLots,
    purchasesForCurrentLot: currentLot?.purchaseCount ?? 0,
    purchasesAllLots,
    lastPurchaseDate,
    groupedByLot
  };
}
