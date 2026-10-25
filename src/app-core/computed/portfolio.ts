import { DEFAULT_VALUES } from "../../constants.ts";
import { convertAmountToCad, normalizeUsdToCadRate } from "../../domain/currency.ts";
import {
  calculateLotPerformanceSummary,
  calculatePortfolioTotals,
  calculateSaleProfit
} from "../../domain/calculations.ts";
import type { Lot, LotPerformanceSummary, PortfolioDashboardPreset, Sale } from "../../types/app.ts";
import { getTodayDate } from "../../shared/lot-dates.ts";
import { isLotAwaitingReceipt } from "../../shared/lot-receipt.ts";
import type { PortfolioComputedObject } from "../context/portfolio.ts";
import { buildLotOptionItems } from "../shared/lot-option-items.ts";
import { getLotType } from "../shared/lot-types.ts";
import {
  getSalesByLotIdFromAccessContext,
  type AllLotSalesAccessContext
} from "../shared/lot-sales-access.ts";
import {
  pickBestForecastScenario,
  type ForecastScenario
} from "./forecast-scenarios.ts";
import {
  buildPortfolioSalesByUserChartData,
  buildPortfolioSalesByUserDrilldownRows
} from "./portfolio-sales-by-user.ts";
import {
  buildScenarioFromProjection,
  computeLotModeProjections,
  summarizeForecastAverage,
  type PortfolioModeProjection
} from "./portfolio-forecast.ts";
import { buildPortfolioReceiptSummary } from "./portfolio-receipt.ts";

type PortfolioForecastScenario = ForecastScenario<"item" | "box" | "rtyh">;

function getAllSalesByLotIdForPortfolio(
  context: AllLotSalesAccessContext,
  lotIds: number[]
): Map<number, Sale[]> {
  return getSalesByLotIdFromAccessContext(context, lotIds);
}

function lotMatchesPortfolioTypeFilter(
  lot: { lotType?: string } | undefined,
  filter: "both" | "bulk" | "singles"
): boolean {
  if (filter === "both") return true;
  return getLotType(lot) === filter;
}

function getExplicitlyScopedPortfolioLots(
  lots: Lot[],
  selectedLotIds: number[],
  typeFilter: "both" | "bulk" | "singles",
  receiptFilter: "all" | "received" | "awaiting"
): Lot[] {
  const lotsById = new Map(lots.map((lot) => [lot.id, lot] as const));
  const allLotIds = lots.map((lot) => lot.id);
  const validSelectedIds = selectedLotIds.filter((id) => allLotIds.includes(id));
  const baseIds = validSelectedIds.length > 0
    ? validSelectedIds
    : (selectedLotIds.length === 0 ? allLotIds : []);
  return baseIds
    .map((id) => lotsById.get(id))
    .filter((lot): lot is Lot => !!lot
      && lotMatchesPortfolioTypeFilter(lot, typeFilter)
      && (receiptFilter === "all"
        || (receiptFilter === "awaiting") === isLotAwaitingReceipt(lot)));
}

function lotForNativeCalculations(lot: Lot): Lot {
  return { ...lot, exchangeRate: normalizeUsdToCadRate(lot.exchangeRate, DEFAULT_VALUES.EXCHANGE_RATE) };
}

function toPortfolioCad(amount: number, lot: Lot): number {
  return convertAmountToCad(amount, lot.sellingCurrency, lot.exchangeRate, DEFAULT_VALUES.EXCHANGE_RATE);
}

function portfolioCadToNative(amount: number, lot: Lot): number {
  const rate = normalizeUsdToCadRate(lot.exchangeRate, DEFAULT_VALUES.EXCHANGE_RATE);
  return lot.sellingCurrency === "USD" ? amount / rate : amount;
}

function normalizePortfolioDashboardPreset(value: unknown): PortfolioDashboardPreset {
  if (
    value === "active"
    || value === "needs_first_sale"
    || value === "at_risk"
    || value === "profit_winners"
    || value === "finished"
  ) {
    return value;
  }
  return "all";
}

function lotIsSoldOut(summary: Pick<LotPerformanceSummary, "soldPacks" | "totalPacks">): boolean {
  return Number(summary.totalPacks) > 0 && Number(summary.soldPacks) >= Number(summary.totalPacks);
}

function lotMatchesPortfolioDashboardPreset(
  summary: LotPerformanceSummary,
  preset: PortfolioDashboardPreset,
  awaitingReceipt = false
): boolean {
  const hasSales = Number(summary.salesCount) > 0;
  const soldOut = lotIsSoldOut(summary);

  if (preset === "active") return hasSales && !soldOut;
  if (preset === "needs_first_sale") return !awaitingReceipt && !hasSales && !soldOut;
  if (preset === "finished") return soldOut;
  if (preset === "at_risk") return !awaitingReceipt && hasSales && !soldOut && Number(summary.totalProfit) < 0;
  if (preset === "profit_winners") return !awaitingReceipt && hasSales && Number(summary.totalProfit) > 0;
  return true;
}

function getPortfolioPerformanceSummaries(
  context: AllLotSalesAccessContext,
  lots: Lot[]
): Map<number, LotPerformanceSummary> {
  const salesByLotId = getAllSalesByLotIdForPortfolio(context, lots.map((lot) => lot.id));
  return new Map(lots.map((lot) => [
    lot.id,
    calculateLotPerformanceSummary(
      lot,
      salesByLotId.get(lot.id) ?? [],
      DEFAULT_VALUES.EXCHANGE_RATE
    )
  ] as const));
}

export const portfolioComputed: PortfolioComputedObject = {
  portfolioLotFilterItems() {
    void this.salesCacheEpoch;
    const filter = this.portfolioLotTypeFilter === "bulk" || this.portfolioLotTypeFilter === "singles"
      ? this.portfolioLotTypeFilter
      : "both";
    const preset = normalizePortfolioDashboardPreset(this.portfolioDashboardPreset);
    const typedLots = this.lots.filter((lot) => lotMatchesPortfolioTypeFilter(lot, filter));
    const summaryByLotId = getPortfolioPerformanceSummaries(this, typedLots);
    const linksByLotId = new Map((this.lotItems ?? []).map(item => [item.value, item.shopifyLink]));
    return buildLotOptionItems(
      typedLots
        .filter((lot) => {
          const summary = summaryByLotId.get(lot.id);
          return summary
            ? (this.portfolioReceiptFilter === "all"
              || (this.portfolioReceiptFilter === "awaiting") === isLotAwaitingReceipt(lot))
              && lotMatchesPortfolioDashboardPreset(summary, preset, isLotAwaitingReceipt(lot))
            : false;
        })
        .map((lot) => ({
          ...lot,
          shopifyLink: linksByLotId.get(lot.id),
          isComplete: lotIsSoldOut(summaryByLotId.get(lot.id) ?? { soldPacks: 0, totalPacks: 0 })
        })),
      this.preferredLanguage
    );
  },

  portfolioSelectedLotIds(): number[] {
    const filter = this.portfolioLotTypeFilter === "bulk" || this.portfolioLotTypeFilter === "singles"
      ? this.portfolioLotTypeFilter
      : "both";
    const preset = normalizePortfolioDashboardPreset(this.portfolioDashboardPreset);
    const baseLots = getExplicitlyScopedPortfolioLots(
      this.lots,
      this.portfolioLotFilterIds,
      filter,
      this.portfolioReceiptFilter
    );
    const summaryByLotId = getPortfolioPerformanceSummaries(this, baseLots);
    return baseLots
      .filter((lot) => {
        const summary = summaryByLotId.get(lot.id);
        return summary ? lotMatchesPortfolioDashboardPreset(summary, preset, isLotAwaitingReceipt(lot)) : false;
      })
      .map((lot) => lot.id);
  },

  portfolioSalesHydrationLotIds(): number[] {
    const filter = this.portfolioLotTypeFilter === "bulk" || this.portfolioLotTypeFilter === "singles"
      ? this.portfolioLotTypeFilter
      : "both";
    return getExplicitlyScopedPortfolioLots(
      this.lots,
      this.portfolioLotFilterIds,
      filter,
      this.portfolioReceiptFilter
    ).map((lot) => lot.id);
  },

  portfolioForecastScenarios(): PortfolioForecastScenario[] {
    const selectedLotIds = new Set(
      Array.isArray(this.portfolioSelectedLotIds)
        ? this.portfolioSelectedLotIds
        : (this.lots || []).map((lot) => lot.id)
    );
    const selectedLots = (this.lots || []).filter((lot) => selectedLotIds.has(lot.id));
    if (selectedLots.length === 0) return [];

    const performanceByLotId = new Map((this.allLotPerformance || []).map((row) => [row.lotId, row]));
    const totalSelectedRevenue = selectedLots.reduce((sum, lot) => {
      return sum + (performanceByLotId.get(lot.id)?.totalRevenue || 0);
    }, 0);
    const totalSelectedCost = selectedLots.reduce((sum, lot) => {
      return sum + (performanceByLotId.get(lot.id)?.totalCost || 0);
    }, 0);

    const modeTotals: Record<"item" | "box" | "rtyh", PortfolioModeProjection> = {
      item: { units: 0, gross: 0, estimatedNetRemaining: 0 },
      box: { units: 0, gross: 0, estimatedNetRemaining: 0 },
      rtyh: { units: 0, gross: 0, estimatedNetRemaining: 0 }
    };

    for (const lot of selectedLots) {
      const row = performanceByLotId.get(lot.id);
      if (!row) continue;
      const nativeLot = lotForNativeCalculations(lot);
      const projections = computeLotModeProjections({
        lot: nativeLot,
        summary: {
          soldPacks: row.soldPacks,
          totalPacks: row.totalPacks,
          totalCost: portfolioCadToNative(row.totalCost, nativeLot)
        },
        isCurrentLot: lot.id === this.currentLotId,
        hasProAccess: this.hasProAccess,
        livePackPrice: this.livePackPrice,
        liveBoxPriceSell: this.liveBoxPriceSell,
        liveSpotPrice: this.liveSpotPrice,
        whatnotFeeSummary: this.whatnotFeeSummary
      });

      if (projections.item) {
        modeTotals.item.units += projections.item.units;
        modeTotals.item.gross += toPortfolioCad(projections.item.gross, nativeLot);
        modeTotals.item.estimatedNetRemaining += toPortfolioCad(projections.item.estimatedNetRemaining, nativeLot);
      }
      if (projections.box) {
        modeTotals.box.units += projections.box.units;
        modeTotals.box.gross += toPortfolioCad(projections.box.gross, nativeLot);
        modeTotals.box.estimatedNetRemaining += toPortfolioCad(projections.box.estimatedNetRemaining, nativeLot);
      }
      if (projections.rtyh) {
        modeTotals.rtyh.units += projections.rtyh.units;
        modeTotals.rtyh.gross += toPortfolioCad(projections.rtyh.gross, nativeLot);
        modeTotals.rtyh.estimatedNetRemaining += toPortfolioCad(projections.rtyh.estimatedNetRemaining, nativeLot);
      }
    }

    const scenarios = [
      buildScenarioFromProjection({
        id: "item",
        label: "Item live price (all selected lots)",
        unitLabel: "item",
        projection: modeTotals.item,
        baseRevenue: totalSelectedRevenue,
        baseCost: totalSelectedCost
      }),
      buildScenarioFromProjection({
        id: "box",
        label: "Box live price (bulk selected lots)",
        unitLabel: "box",
        projection: modeTotals.box,
        baseRevenue: totalSelectedRevenue,
        baseCost: totalSelectedCost
      }),
      buildScenarioFromProjection({
        id: "rtyh",
        label: "RTYH live price (bulk selected lots)",
        unitLabel: "spot",
        projection: modeTotals.rtyh,
        baseRevenue: totalSelectedRevenue,
        baseCost: totalSelectedCost
      })
    ].filter((scenario): scenario is PortfolioForecastScenario => scenario != null);

    return scenarios;
  },

  averagePortfolioForecastScenario(): {
    label: string;
    modeCount: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  } | null {
    const scenarios = this.portfolioForecastScenarios;
    if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
    const modeCount = scenarios.length;
    const totalForecastRevenue = scenarios.reduce((sum, scenario) => sum + (Number(scenario.forecastRevenue) || 0), 0);
    const totalForecastProfit = scenarios.reduce((sum, scenario) => sum + (Number(scenario.forecastProfit) || 0), 0);
    const forecastRevenue = totalForecastRevenue / modeCount;
    const forecastProfit = totalForecastProfit / modeCount;
    const selectedTotalCost = this.portfolioTotals?.totalCost || 0;
    const forecastMarginPercent = selectedTotalCost > 0
      ? ((forecastProfit / selectedTotalCost) * 100)
      : null;
    return {
      label: "Average forecast (all selling modes)",
      modeCount,
      forecastRevenue,
      forecastProfit,
      forecastMarginPercent
    };
  },

  bestPortfolioForecastScenario(): PortfolioForecastScenario | null {
    return pickBestForecastScenario(this.portfolioForecastScenarios);
  },

  portfolioSalesByUserChartData() {
    void this.salesCacheEpoch;
    const selectedLotIds = this.portfolioSelectedLotIds;
    const salesByLotId = getAllSalesByLotIdForPortfolio(this, this.lots.map((lot) => lot.id));

    return buildPortfolioSalesByUserChartData({
      lots: this.lots,
      salesByLotId,
      selectedLotIds,
      scopeType: this.activeScopeType,
      workspaceMembers: this.workspaceMembers,
      metric: this.portfolioSalesByUserMetric,
      grouping: this.portfolioSalesGrouping,
      period: this.portfolioSalesByUserPeriod,
      todayDate: getTodayDate(),
      preferredLanguage: this.preferredLanguage
    });
  },

  portfolioSalesByUserDrilldownRows() {
    void this.salesCacheEpoch;
    const selectedLotIds = this.portfolioSelectedLotIds;
    const salesByLotId = getAllSalesByLotIdForPortfolio(this, this.lots.map((lot) => lot.id));

    return buildPortfolioSalesByUserDrilldownRows({
      lots: this.lots,
      salesByLotId,
      selectedLotIds,
      scopeType: this.activeScopeType,
      workspaceMembers: this.workspaceMembers,
      todayDate: getTodayDate(),
      period: this.portfolioSalesByUserPeriod,
      preferredLanguage: this.preferredLanguage
    });
  },

  hasPortfolioSalesByUserData() {
    return (this.portfolioSalesByUserChartData?.series?.length ?? 0) > 0;
  },

  allLotPerformance() {
    void this.salesCacheEpoch;
    const selectedLotIds = Array.isArray(this.portfolioSelectedLotIds)
      ? this.portfolioSelectedLotIds
      : this.lots.map((lot) => lot.id);
    const selectedLotIdSet = new Set(selectedLotIds);
    const salesByLotId = getAllSalesByLotIdForPortfolio(this, selectedLotIds);

    const rows = this.lots
      .filter((lot) => selectedLotIdSet.has(lot.id))
      .map((lot) => {
        const sales = salesByLotId.get(lot.id) ?? [];
        const nativeLot = lotForNativeCalculations(lot);
        const summary = calculateLotPerformanceSummary(nativeLot, sales, DEFAULT_VALUES.EXCHANGE_RATE);
        const realizedProfit = sales.reduce((sum, sale) => {
          return sum + calculateSaleProfit({
            sale,
            lotType: getLotType(lot),
            packsPerBox: lot.packsPerBox,
            sellingTaxPercent: lot.sellingTaxPercent,
            totalCaseCost: summary.totalCost,
            totalPacks: summary.totalPacks,
            purchaseCurrency: nativeLot.currency,
            sellingCurrency: nativeLot.sellingCurrency,
            exchangeRate: nativeLot.exchangeRate,
            singlesPurchases: lot.singlesPurchases,
            defaultExchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
            feeProfileInput: nativeLot
          });
        }, 0);
        const realizedRevenueNative = summary.totalRevenue;
        const realizedMarginPercent = realizedRevenueNative > 0
          ? ((realizedProfit / realizedRevenueNative) * 100)
          : null;
        const projections = computeLotModeProjections({
          lot: nativeLot,
          summary: {
            soldPacks: summary.soldPacks,
            totalPacks: summary.totalPacks,
            totalCost: summary.totalCost
          },
          isCurrentLot: lot.id === this.currentLotId,
          hasProAccess: this.hasProAccess,
          livePackPrice: this.livePackPrice,
          liveBoxPriceSell: this.liveBoxPriceSell,
          liveSpotPrice: this.liveSpotPrice,
          whatnotFeeSummary: this.whatnotFeeSummary
        });
        const forecastSummary = summarizeForecastAverage({
          projections: [projections.item, projections.box, projections.rtyh],
          baseRevenue: summary.totalRevenue,
          baseCost: summary.totalCost
        });

        const lotType: "Bulk" | "Singles" = getLotType(lot) === "singles" ? "Singles" : "Bulk";
        return {
          ...summary,
          totalRevenue: toPortfolioCad(summary.totalRevenue, nativeLot),
          totalCost: toPortfolioCad(summary.totalCost, nativeLot),
          totalProfit: toPortfolioCad(summary.totalProfit, nativeLot),
          realizedCost: toPortfolioCad(Math.max(0, realizedRevenueNative - realizedProfit), nativeLot),
          realizedProfit: toPortfolioCad(realizedProfit, nativeLot),
          lotId: summary.lotId,
          lotName: summary.lotName,
          lotType,
          expectedReceiptDate: lot.expectedReceiptDate || undefined,
          realizedMarginPercent,
          forecastProfitAverage: forecastSummary.forecastProfitAverage == null ? null : toPortfolioCad(forecastSummary.forecastProfitAverage, nativeLot),
          forecastRevenueAverage: forecastSummary.forecastRevenueAverage == null ? null : toPortfolioCad(forecastSummary.forecastRevenueAverage, nativeLot),
          forecastScenarioCount: forecastSummary.forecastScenarioCount
        };
      });

    return rows.sort((a, b) => (b.realizedProfit ?? 0) - (a.realizedProfit ?? 0));
  },

  portfolioTotals() {
    return calculatePortfolioTotals(this.allLotPerformance);
  },

  portfolioReceiptSummary() {
    return buildPortfolioReceiptSummary(this.allLotPerformance, getTodayDate());
  },

  hasPortfolioData(): boolean {
    return this.allLotPerformance.length > 0;
  }
};









