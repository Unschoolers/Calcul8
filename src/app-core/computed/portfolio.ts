import { DEFAULT_VALUES } from "../../constants.ts";
import {
  calculateLotPerformanceSummary,
  calculatePortfolioTotals,
  calculateSaleProfit
} from "../../domain/calculations.ts";
import type { Lot, LotPerformanceSummary, PortfolioDashboardPreset, Sale } from "../../types/app.ts";
import type { AppComputedObject } from "../context-contracts.ts";
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
  preset: PortfolioDashboardPreset
): boolean {
  const hasSales = Number(summary.salesCount) > 0;
  const soldOut = lotIsSoldOut(summary);

  if (preset === "active") return hasSales && !soldOut;
  if (preset === "needs_first_sale") return !hasSales && !soldOut;
  if (preset === "finished") return soldOut;
  if (preset === "at_risk") return hasSales && !soldOut && Number(summary.totalProfit) < 0;
  if (preset === "profit_winners") return hasSales && Number(summary.totalProfit) > 0;
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

export const portfolioComputed: Pick<
  AppComputedObject,
  "portfolioLotFilterItems" |
  "portfolioSelectedLotIds" |
  "portfolioForecastScenarios" |
  "averagePortfolioForecastScenario" |
  "bestPortfolioForecastScenario" |
  "portfolioSalesByUserChartData" |
  "portfolioSalesByUserDrilldownRows" |
  "hasPortfolioSalesByUserData" |
  "allLotPerformance" |
  "portfolioTotals" |
  "hasPortfolioData"
> = {
  portfolioLotFilterItems() {
    void this.salesCacheEpoch;
    const filter = this.portfolioLotTypeFilter === "bulk" || this.portfolioLotTypeFilter === "singles"
      ? this.portfolioLotTypeFilter
      : "both";
    const preset = normalizePortfolioDashboardPreset(this.portfolioDashboardPreset);
    const typedLots = this.lots.filter((lot) => lotMatchesPortfolioTypeFilter(lot, filter));
    const summaryByLotId = getPortfolioPerformanceSummaries(this, typedLots);
    return buildLotOptionItems(
      typedLots
        .filter((lot) => {
          const summary = summaryByLotId.get(lot.id);
          return summary ? lotMatchesPortfolioDashboardPreset(summary, preset) : false;
        })
        .map((lot) => ({
          ...lot,
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
    const lotsById = new Map(this.lots.map((lot) => [lot.id, lot] as const));
    const allLotIds = this.lots.map((lot) => lot.id);
    const selectedIds = this.portfolioLotFilterIds.filter((id) => allLotIds.includes(id));
    const baseIds = selectedIds.length > 0 ? selectedIds : allLotIds;
    const baseLots = baseIds
      .map((id) => lotsById.get(id))
      .filter((lot): lot is Lot => !!lot && lotMatchesPortfolioTypeFilter(lot, filter));
    const summaryByLotId = getPortfolioPerformanceSummaries(this, baseLots);
    return baseLots
      .filter((lot) => {
        const summary = summaryByLotId.get(lot.id);
        return summary ? lotMatchesPortfolioDashboardPreset(summary, preset) : false;
      })
      .map((lot) => lot.id);
  },

  portfolioForecastScenarios(): PortfolioForecastScenario[] {
    const selectedLotIds = new Set(
      Array.isArray(this.portfolioSelectedLotIds) && this.portfolioSelectedLotIds.length > 0
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
      const projections = computeLotModeProjections({
        lot,
        summary: {
          soldPacks: row.soldPacks,
          totalPacks: row.totalPacks,
          totalCost: row.totalCost
        },
        isCurrentLot: lot.id === this.currentLotId,
        hasProAccess: this.hasProAccess,
        livePackPrice: this.livePackPrice,
        liveBoxPriceSell: this.liveBoxPriceSell,
        liveSpotPrice: this.liveSpotPrice
      });

      if (projections.item) {
        modeTotals.item.units += projections.item.units;
        modeTotals.item.gross += projections.item.gross;
        modeTotals.item.estimatedNetRemaining += projections.item.estimatedNetRemaining;
      }
      if (projections.box) {
        modeTotals.box.units += projections.box.units;
        modeTotals.box.gross += projections.box.gross;
        modeTotals.box.estimatedNetRemaining += projections.box.estimatedNetRemaining;
      }
      if (projections.rtyh) {
        modeTotals.rtyh.units += projections.rtyh.units;
        modeTotals.rtyh.gross += projections.rtyh.gross;
        modeTotals.rtyh.estimatedNetRemaining += projections.rtyh.estimatedNetRemaining;
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
    const selectedLotIds = Array.isArray(this.portfolioSelectedLotIds)
      ? this.portfolioSelectedLotIds
      : this.lots.map((lot) => lot.id);
    const salesByLotId = getAllSalesByLotIdForPortfolio(this, this.lots.map((lot) => lot.id));

    return buildPortfolioSalesByUserChartData({
      lots: this.lots,
      salesByLotId,
      selectedLotIds,
      scopeType: this.activeScopeType,
      workspaceMembers: this.workspaceMembers,
      metric: this.portfolioSalesByUserMetric,
      todayDate: new Date().toISOString().slice(0, 10),
      preferredLanguage: this.preferredLanguage
    });
  },

  portfolioSalesByUserDrilldownRows() {
    void this.salesCacheEpoch;
    const selectedLotIds = Array.isArray(this.portfolioSelectedLotIds)
      ? this.portfolioSelectedLotIds
      : this.lots.map((lot) => lot.id);
    const salesByLotId = getAllSalesByLotIdForPortfolio(this, this.lots.map((lot) => lot.id));

    return buildPortfolioSalesByUserDrilldownRows({
      lots: this.lots,
      salesByLotId,
      selectedLotIds,
      scopeType: this.activeScopeType,
      workspaceMembers: this.workspaceMembers,
      todayDate: new Date().toISOString().slice(0, 10),
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
        const summary = calculateLotPerformanceSummary(lot, sales, DEFAULT_VALUES.EXCHANGE_RATE);
        const realizedProfit = sales.reduce((sum, sale) => {
          return sum + calculateSaleProfit({
            sale,
            lotType: getLotType(lot),
            sellingTaxPercent: lot.sellingTaxPercent,
            totalCaseCost: summary.totalCost,
            totalPacks: summary.totalPacks,
            purchaseCurrency: lot.currency,
            sellingCurrency: lot.sellingCurrency,
            exchangeRate: lot.exchangeRate,
            singlesPurchases: lot.singlesPurchases,
            defaultExchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
            feeProfileInput: lot
          });
        }, 0);
        const realizedRevenue = summary.totalRevenue;
        const realizedCost = Math.max(0, realizedRevenue - realizedProfit);
        const realizedMarginPercent = realizedRevenue > 0
          ? ((realizedProfit / realizedRevenue) * 100)
          : null;
        const projections = computeLotModeProjections({
          lot,
          summary: {
            soldPacks: summary.soldPacks,
            totalPacks: summary.totalPacks,
            totalCost: summary.totalCost
          },
          isCurrentLot: lot.id === this.currentLotId,
          hasProAccess: this.hasProAccess,
          livePackPrice: this.livePackPrice,
          liveBoxPriceSell: this.liveBoxPriceSell,
          liveSpotPrice: this.liveSpotPrice
        });
        const forecastSummary = summarizeForecastAverage({
          projections: [projections.item, projections.box, projections.rtyh],
          baseRevenue: summary.totalRevenue,
          baseCost: summary.totalCost
        });

        const lotType: "Bulk" | "Singles" = getLotType(lot) === "singles" ? "Singles" : "Bulk";
        return {
          ...summary,
          lotId: summary.lotId,
          lotName: summary.lotName,
          lotType,
          realizedCost,
          realizedProfit,
          realizedMarginPercent,
          forecastProfitAverage: forecastSummary.forecastProfitAverage,
          forecastRevenueAverage: forecastSummary.forecastRevenueAverage,
          forecastScenarioCount: forecastSummary.forecastScenarioCount
        };
      });

    return rows.sort((a, b) => (b.realizedProfit ?? 0) - (a.realizedProfit ?? 0));
  },

  portfolioTotals() {
    return calculatePortfolioTotals(this.allLotPerformance);
  },

  hasPortfolioData(): boolean {
    return this.allLotPerformance.length > 0;
  }
};











