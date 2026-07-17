import type { CustomerPerformanceRow } from "./customer-performance.ts";

export type PortfolioSortDirection = "asc" | "desc";
export type PortfolioLotPerformanceSortKey = "source" | "name" | "status" | "soldMargin" | "risk" | "profit";
export type PortfolioCustomerPerformanceSortKey = "customer" | "spent" | "purchases" | "lots" | "last" | "topLot";

export type PortfolioSortOption<Key extends string> = {
  key: Key;
  label: string;
};

export type PortfolioCopyFn = (key: string, fallback: string) => string;

export type PortfolioLotPerformanceRow = Record<string, unknown> & {
  lotName?: string;
  salesCount?: number;
  soldPacks?: number;
  totalPacks?: number;
  realizedMarginPercent?: number | null;
  totalProfit?: number | null;
  realizedProfit?: number | null;
  forecastProfitAverage?: number | null;
};

export type PortfolioLotPrimaryProfit = {
  value: number;
  projected: boolean;
  tone: "success" | "error";
};

function compareText(left: unknown, right: unknown): number {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base" });
}

function compareNumbers(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const normalizedLeft = Number.isFinite(leftNumber) ? leftNumber : Number.NEGATIVE_INFINITY;
  const normalizedRight = Number.isFinite(rightNumber) ? rightNumber : Number.NEGATIVE_INFINITY;
  return normalizedLeft - normalizedRight;
}

function applySortDirection(value: number, direction: PortfolioSortDirection): number {
  return direction === "asc" ? value : -value;
}

function timestampOrStart(value: unknown): number {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function normalizePortfolioSortDirection(value: unknown, fallback: PortfolioSortDirection = "asc"): PortfolioSortDirection {
  if (value === "asc" || value === "desc") return value;
  return fallback;
}

/** Chooses the profit signal displayed for a lot consistently across the UI. */
export function getPortfolioLotPrimaryProfit(row: PortfolioLotPerformanceRow): PortfolioLotPrimaryProfit {
  const projected = Number(row.soldPacks ?? 0) < Number(row.totalPacks ?? 0)
    && typeof row.forecastProfitAverage === "number";
  const value = projected
    ? Number(row.forecastProfitAverage)
    : Number(row.salesCount ?? 0) > 0
      ? Number(row.realizedProfit ?? 0)
      : Number(row.totalProfit ?? 0);
  const normalized = Number.isFinite(value) ? value : 0;
  return {
    value: normalized,
    projected,
    tone: normalized >= 0 ? "success" : "error"
  };
}

export function sortPortfolioLotPerformanceRows<T extends PortfolioLotPerformanceRow>(
  rows: T[],
  key: PortfolioLotPerformanceSortKey,
  direction: PortfolioSortDirection
): T[] {
  if (key === "source") return [...rows];
  return [...rows].sort((left, right) => {
    let result = 0;
    if (key === "name") result = compareText(left.lotName, right.lotName);
    else if (key === "status") {
      const leftTotal = Number(left.totalPacks ?? 0);
      const rightTotal = Number(right.totalPacks ?? 0);
      const leftRatio = leftTotal > 0 ? Number(left.soldPacks ?? 0) / leftTotal : Number(left.salesCount ?? 0);
      const rightRatio = rightTotal > 0 ? Number(right.soldPacks ?? 0) / rightTotal : Number(right.salesCount ?? 0);
      result = compareNumbers(leftRatio, rightRatio);
    } else if (key === "soldMargin") result = compareNumbers(left.realizedMarginPercent, right.realizedMarginPercent);
    else if (key === "risk") {
      result = compareNumbers(
        Math.max(0, -Number(left.totalProfit ?? 0)),
        Math.max(0, -Number(right.totalProfit ?? 0))
      );
    } else if (key === "profit") {
      result = compareNumbers(
        Number(left.totalProfit ?? left.realizedProfit ?? left.forecastProfitAverage ?? 0),
        Number(right.totalProfit ?? right.realizedProfit ?? right.forecastProfitAverage ?? 0)
      );
    }
    return applySortDirection(result || compareText(left.lotName, right.lotName), direction);
  });
}

export function sortCustomerPerformanceRows(
  rows: CustomerPerformanceRow[],
  key: PortfolioCustomerPerformanceSortKey,
  direction: PortfolioSortDirection
): CustomerPerformanceRow[] {
  return [...rows].sort((left, right) => {
    let result = 0;
    if (key === "customer") result = compareText(left.username, right.username);
    else if (key === "spent") result = compareNumbers(left.totalSpent, right.totalSpent);
    else if (key === "purchases") result = compareNumbers(left.purchaseCount, right.purchaseCount);
    else if (key === "lots") result = compareNumbers(left.lotCount, right.lotCount);
    else if (key === "last") result = compareNumbers(timestampOrStart(left.lastPurchaseDate), timestampOrStart(right.lastPurchaseDate));
    else if (key === "topLot") result = compareText(left.topLotName, right.topLotName);
    return applySortDirection(result || compareText(left.username, right.username), direction);
  });
}

export function getPortfolioLotPerformanceSortOptions(copy: PortfolioCopyFn): Array<PortfolioSortOption<PortfolioLotPerformanceSortKey>> {
  return [
    { key: "name", label: copy("portfolioLotColumnNameLabel", "Lot") },
    { key: "status", label: copy("portfolioLotColumnStatusLabel", "Status") },
    { key: "soldMargin", label: copy("portfolioLotColumnSoldMarginLabel", "Sold margin") },
    { key: "risk", label: copy("portfolioLotColumnRiskLabel", "At risk") },
    { key: "profit", label: copy("portfolioLotColumnProfitLabel", "Profit") }
  ];
}

export function getPortfolioCustomerPerformanceSortOptions(copy: PortfolioCopyFn): Array<PortfolioSortOption<PortfolioCustomerPerformanceSortKey>> {
  return [
    { key: "customer", label: copy("portfolioCustomerColumnNameLabel", "Customer") },
    { key: "spent", label: copy("portfolioCustomerColumnSpentLabel", "Spent") },
    { key: "purchases", label: copy("portfolioCustomerColumnPurchasesLabel", "Purchases") },
    { key: "lots", label: copy("portfolioCustomerColumnLotsLabel", "Lots") },
    { key: "last", label: copy("portfolioCustomerColumnLastLabel", "Last purchase") },
    { key: "topLot", label: copy("portfolioCustomerColumnTopLotLabel", "Top lot") }
  ];
}

export function getPortfolioPerformanceSortIcon<Key extends string>(
  activeKey: Key,
  direction: PortfolioSortDirection,
  key: Key
): string {
  if (activeKey !== key) return "mdi-swap-vertical";
  return direction === "asc" ? "mdi-arrow-up" : "mdi-arrow-down";
}

export function getPortfolioPerformanceSortButtonClass<Key extends string>(
  activeKey: Key,
  key: Key
): Record<string, boolean> {
  return {
    "is-active": activeKey === key
  };
}
