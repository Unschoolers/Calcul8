import type { Lot, Sale } from "../../types/app.ts";
import { normalizeBuyerKey, saleGrossBuyerSpend } from "./buyer-quick-view.ts";

export interface CustomerPerformanceRow {
  username: string;
  normalizedKey: string;
  totalSpent: number;
  purchaseCount: number;
  lotCount: number;
  lastPurchaseDate: string | null;
  topLotId: number | null;
  topLotName: string;
  topLotSpent: number;
}

export interface CustomerPerformanceSummary {
  customerCount: number;
  repeatBuyerCount: number;
  totalSpent: number;
  topCustomer: CustomerPerformanceRow | null;
  lastActiveCustomer: CustomerPerformanceRow | null;
  topFiveSharePercent: number;
}

export interface BuildCustomerPerformanceRowsParams {
  lots: Lot[];
  salesByLotId: Map<number, Sale[]>;
}

type MutableCustomerPerformanceRow = CustomerPerformanceRow & {
  lotSpendById: Map<number, number>;
};

function displayName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
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

function getLotNameById(lots: Lot[]): Map<number, string> {
  return new Map(lots.map((lot) => [Number(lot.id), displayName(lot.name) || `Lot ${lot.id}`]));
}

export function buildCustomerPerformanceRows(params: BuildCustomerPerformanceRowsParams): CustomerPerformanceRow[] {
  const lots = Array.isArray(params.lots) ? params.lots : [];
  const lotNames = getLotNameById(lots);
  const customers = new Map<string, MutableCustomerPerformanceRow>();

  for (const [rawLotId, rawSales] of params.salesByLotId instanceof Map ? params.salesByLotId.entries() : []) {
    const lotId = Number(rawLotId);
    if (!Number.isFinite(lotId)) continue;
    const sales = Array.isArray(rawSales) ? rawSales : [];

    for (const sale of sales) {
      const normalizedKey = normalizeBuyerKey(sale.customer);
      if (!normalizedKey) continue;

      const current = customers.get(normalizedKey) ?? {
        username: displayName(sale.customer),
        normalizedKey,
        totalSpent: 0,
        purchaseCount: 0,
        lotCount: 0,
        lastPurchaseDate: null,
        topLotId: null,
        topLotName: "",
        topLotSpent: 0,
        lotSpendById: new Map<number, number>()
      };
      const spend = saleGrossBuyerSpend(sale);
      current.totalSpent += spend;
      current.purchaseCount += 1;
      current.lastPurchaseDate = latestDate(current.lastPurchaseDate, sale.date);
      current.lotSpendById.set(lotId, (current.lotSpendById.get(lotId) ?? 0) + spend);
      customers.set(normalizedKey, current);
    }
  }

  return [...customers.values()]
    .map((row) => {
      const lotSpendEntries = [...row.lotSpendById.entries()].sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return (lotNames.get(left[0]) ?? "").localeCompare(lotNames.get(right[0]) ?? "");
      });
      const [topLotId, topLotSpent] = lotSpendEntries[0] ?? [null, 0];
      const result: CustomerPerformanceRow = {
        username: row.username,
        normalizedKey: row.normalizedKey,
        totalSpent: row.totalSpent,
        purchaseCount: row.purchaseCount,
        lotCount: row.lotSpendById.size,
        lastPurchaseDate: row.lastPurchaseDate,
        topLotId,
        topLotName: topLotId == null ? "" : lotNames.get(topLotId) ?? `Lot ${topLotId}`,
        topLotSpent
      };
      return result;
    })
    .sort((left, right) => {
      if (right.totalSpent !== left.totalSpent) return right.totalSpent - left.totalSpent;
      if (right.purchaseCount !== left.purchaseCount) return right.purchaseCount - left.purchaseCount;
      return left.username.localeCompare(right.username);
    });
}

export function buildCustomerPerformanceSummary(rows: CustomerPerformanceRow[]): CustomerPerformanceSummary {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalSpent = safeRows.reduce((sum, row) => sum + (Number(row.totalSpent) || 0), 0);
  const topFiveSpent = safeRows
    .slice(0, 5)
    .reduce((sum, row) => sum + (Number(row.totalSpent) || 0), 0);
  const lastActiveCustomer = [...safeRows].sort((left, right) => {
    const leftTime = Date.parse(left.lastPurchaseDate ?? "");
    const rightTime = Date.parse(right.lastPurchaseDate ?? "");
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.totalSpent - left.totalSpent;
  })[0] ?? null;

  return {
    customerCount: safeRows.length,
    repeatBuyerCount: safeRows.filter((row) => row.purchaseCount > 1).length,
    totalSpent,
    topCustomer: safeRows[0] ?? null,
    lastActiveCustomer,
    topFiveSharePercent: totalSpent > 0 ? (topFiveSpent / totalSpent) * 100 : 0
  };
}
