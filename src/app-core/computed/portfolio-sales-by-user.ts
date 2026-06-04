import {
  calculateLotPerformanceSummary,
  calculateSaleNetRevenue,
  calculateSaleProfit,
} from "../../domain/calculations.ts";
import { DEFAULT_VALUES } from "../../constants.ts";
import { compareLocalizedText, formatLocalizedCompactDate, translateAppMessage } from "../i18n/index.ts";
import type {
  Lot,
  PortfolioSalesByUserDrilldownRow,
  Sale,
  SaleType,
  WorkspaceMember,
  WorkspaceScopeType
} from "../../types/app.ts";
import { getLotType } from "../shared/lot-types.ts";

const PORTFOLIO_SALES_BY_USER_SERIES_COLORS = [
  "#F7B500",
  "#34C759",
  "#5AC8FA",
  "#AF52DE",
  "#FF9500",
  "#00C7BE",
  "#FF3B30",
  "#7C5E2B"
] as const;

export type PortfolioSalesByUserMetric = "revenue" | "profit" | "count";

export interface PortfolioSalesByUserWeekBucket {
  key: string;
  label: string;
}

export interface PortfolioSalesByUserSeries {
  key: string;
  label: string;
  values: number[];
  total: number;
  color: string;
}

export interface PortfolioSalesByUserChartData {
  weeks: PortfolioSalesByUserWeekBucket[];
  series: PortfolioSalesByUserSeries[];
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date | null {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(date: Date): Date {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - offset);
  return normalized;
}

function buildWeekBucketsWithLocale(todayDate: string, preferredLanguage: string): PortfolioSalesByUserWeekBucket[] {
  const today = parseDateOnly(todayDate) ?? new Date();
  const currentWeekStart = startOfWeek(today);

  return Array.from({ length: 8 }, (_, index) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - ((7 - index) * 7));
    return {
      key: toDateKey(weekStart),
      label: formatLocalizedCompactDate(toDateKey(weekStart), preferredLanguage)
    };
  });
}

function getSeriesIdentity(
  scopeType: WorkspaceScopeType,
  updatedBy: string | undefined,
  workspaceMembers: WorkspaceMember[],
  preferredLanguage?: string
): { key: string; label: string } {
  if (scopeType !== "workspace") {
    return { key: "self", label: translateAppMessage(preferredLanguage || "", "portfolioSalesByUserYouLabel") };
  }

  const normalizedUpdatedBy = String(updatedBy || "").trim();
  if (!normalizedUpdatedBy) {
    return {
      key: "unknown",
      label: translateAppMessage(preferredLanguage || "", "portfolioSalesByUserUnknownLabel")
    };
  }
  if (normalizedUpdatedBy.startsWith("github-actions:")) {
    return {
      key: "imported",
      label: translateAppMessage(preferredLanguage || "", "portfolioSalesByUserImportedLabel")
    };
  }

  const member = workspaceMembers.find((candidate) => candidate.userId === normalizedUpdatedBy);
  const label = String(member?.displayName || normalizedUpdatedBy).trim() || "Unknown";
  return {
    key: normalizedUpdatedBy,
    label
  };
}

function getSaleTypeLabel(type: SaleType, preferredLanguage?: string): string {
  const keyByType: Record<SaleType, string> = {
    pack: "portfolioSalesByUserSaleTypePack",
    box: "portfolioSalesByUserSaleTypeBox",
    rtyh: "portfolioSalesByUserSaleTypeRtyh",
    wheel: "portfolioSalesByUserSaleTypeWheel"
  };
  const fallbackByType: Record<SaleType, string> = {
    pack: "Pack",
    box: "Box",
    rtyh: "RTYH",
    wheel: "Wheel"
  };
  const translated = translateAppMessage(preferredLanguage || "", keyByType[type]);
  return translated && translated !== keyByType[type] ? translated : fallbackByType[type];
}

function getSaleQuantity(sale: Sale): number {
  if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
    return sale.singlesItems.reduce((sum, line) => sum + Math.max(0, Number(line?.quantity ?? 0) || 0), 0);
  }
  return Math.max(0, Number(sale.quantity ?? 0) || 0);
}

function resolveSinglesSaleItemLabel(lot: Lot, sale: Sale): string | null {
  const purchases = Array.isArray(lot.singlesPurchases) ? lot.singlesPurchases : [];
  if (purchases.length === 0) return null;
  const purchaseById = new Map(purchases.map((entry) => [Number(entry.id), entry] as const));
  const entryIds = Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0
    ? sale.singlesItems.map((line) => Number(line?.singlesPurchaseEntryId))
    : [Number(sale.singlesPurchaseEntryId)];
  const labels = [...new Set(entryIds)]
    .map((entryId) => purchaseById.get(entryId))
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
    .map((entry) => {
      const item = String(entry.item || "").trim();
      const cardNumber = String(entry.cardNumber || "").trim();
      if (item && cardNumber) return `${item} #${cardNumber}`;
      return item || cardNumber;
    })
    .filter((label) => label.length > 0);

  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]} +${labels.length - 1}`;
}

function resolveSaleItemLabel(lot: Lot, sale: Sale, preferredLanguage?: string): string {
  if (getLotType(lot) === "singles") {
    const singlesLabel = resolveSinglesSaleItemLabel(lot, sale);
    if (singlesLabel) return singlesLabel;
  }

  const lotName = String(lot.name || "").trim() || "Lot";
  return `${lotName} - ${getSaleTypeLabel(sale.type, preferredLanguage)}`;
}

function hasAnyNonZeroValue(values: number[]): boolean {
  return values.some((value) => Math.abs(Number(value) || 0) > 0.000001);
}

export function buildPortfolioSalesByUserChartData(params: {
  lots: Lot[];
  salesByLotId: Map<number, Sale[]>;
  selectedLotIds: number[];
  scopeType: WorkspaceScopeType;
  workspaceMembers: WorkspaceMember[];
  metric: PortfolioSalesByUserMetric;
  todayDate: string;
  preferredLanguage?: string;
}): PortfolioSalesByUserChartData {
  const selectedLotIdSet = new Set(params.selectedLotIds);
  const weeks = buildWeekBucketsWithLocale(params.todayDate, params.preferredLanguage || "");
  const weekIndexByKey = new Map(weeks.map((week, index) => [week.key, index] as const));
  const seriesMap = new Map<string, { label: string; values: number[] }>();

  for (const lot of params.lots) {
    if (!selectedLotIdSet.has(lot.id)) continue;
    const sales = params.salesByLotId.get(lot.id) ?? [];
    const lotSummary = calculateLotPerformanceSummary(lot, sales, DEFAULT_VALUES.EXCHANGE_RATE);

    for (const sale of sales) {
      const saleDate = parseDateOnly(String(sale.date || ""));
      if (!saleDate) continue;
      const weekKey = toDateKey(startOfWeek(saleDate));
      const weekIndex = weekIndexByKey.get(weekKey);
      if (weekIndex == null) continue;

      const identity = getSeriesIdentity(
        params.scopeType,
        sale.updatedBy,
        params.workspaceMembers,
        params.preferredLanguage
      );
      const current = seriesMap.get(identity.key) ?? {
        label: identity.label,
        values: weeks.map(() => 0)
      };
      if (params.metric === "count") {
        current.values[weekIndex] += 1;
      } else {
        const saleNetRevenue = calculateSaleNetRevenue(sale, lot.sellingTaxPercent, lot);
        current.values[weekIndex] += params.metric === "revenue"
          ? saleNetRevenue
          : calculateSaleProfit({
            sale,
            lotType: getLotType(lot),
            sellingTaxPercent: lot.sellingTaxPercent,
            totalCaseCost: lotSummary.totalCost,
            totalPacks: lotSummary.totalPacks,
            purchaseCurrency: lot.currency,
            sellingCurrency: lot.sellingCurrency,
            exchangeRate: lot.exchangeRate,
            singlesPurchases: lot.singlesPurchases,
            defaultExchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
            feeProfileInput: lot
          });
      }
      seriesMap.set(identity.key, current);
    }
  }

  return {
    weeks,
    series: [...seriesMap.entries()]
      .map(([key, value], index) => ({
        key,
        label: value.label,
        values: value.values,
        total: value.values.reduce((sum, current) => sum + current, 0),
        color: PORTFOLIO_SALES_BY_USER_SERIES_COLORS[index % PORTFOLIO_SALES_BY_USER_SERIES_COLORS.length]
      }))
      .filter((series) => hasAnyNonZeroValue(series.values))
      .sort((left, right) => (
        right.total - left.total
        || compareLocalizedText(left.label, right.label, params.preferredLanguage || "")
      ))
  };
}

export function buildPortfolioSalesByUserDrilldownRows(params: {
  lots: Lot[];
  salesByLotId: Map<number, Sale[]>;
  selectedLotIds: number[];
  scopeType: WorkspaceScopeType;
  workspaceMembers: WorkspaceMember[];
  todayDate: string;
  preferredLanguage?: string;
}): PortfolioSalesByUserDrilldownRow[] {
  const selectedLotIdSet = new Set(params.selectedLotIds);
  const weeks = buildWeekBucketsWithLocale(params.todayDate, params.preferredLanguage || "");
  const weekByKey = new Map(weeks.map((week) => [week.key, week] as const));
  const rows: PortfolioSalesByUserDrilldownRow[] = [];

  for (const lot of params.lots) {
    if (!selectedLotIdSet.has(lot.id)) continue;
    const sales = params.salesByLotId.get(lot.id) ?? [];
    const lotSummary = calculateLotPerformanceSummary(lot, sales, DEFAULT_VALUES.EXCHANGE_RATE);

    for (const sale of sales) {
      const saleDate = parseDateOnly(String(sale.date || ""));
      if (!saleDate) continue;
      const weekKey = toDateKey(startOfWeek(saleDate));
      const week = weekByKey.get(weekKey);
      if (!week) continue;

      const identity = getSeriesIdentity(
        params.scopeType,
        sale.updatedBy,
        params.workspaceMembers,
        params.preferredLanguage
      );
      const revenue = calculateSaleNetRevenue(sale, lot.sellingTaxPercent, lot);
      const profit = calculateSaleProfit({
        sale,
        lotType: getLotType(lot),
        sellingTaxPercent: lot.sellingTaxPercent,
        totalCaseCost: lotSummary.totalCost,
        totalPacks: lotSummary.totalPacks,
        purchaseCurrency: lot.currency,
        sellingCurrency: lot.sellingCurrency,
        exchangeRate: lot.exchangeRate,
        singlesPurchases: lot.singlesPurchases,
        defaultExchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
        feeProfileInput: lot
      });

      rows.push({
        weekKey,
        weekLabel: week.label,
        saleId: sale.id,
        lotId: lot.id,
        lotName: String(lot.name || "").trim() || "Lot",
        itemLabel: resolveSaleItemLabel(lot, sale, params.preferredLanguage),
        date: String(sale.date || ""),
        dateLabel: formatLocalizedCompactDate(String(sale.date || ""), params.preferredLanguage || ""),
        sellerKey: identity.key,
        sellerLabel: identity.label,
        quantity: getSaleQuantity(sale),
        revenue,
        profit
      });
    }
  }

  return rows.sort((left, right) => (
    String(right.date).localeCompare(String(left.date))
    || right.saleId - left.saleId
    || compareLocalizedText(left.itemLabel, right.itemLabel, params.preferredLanguage || "")
  ));
}
