import { DEFAULT_VALUES } from "../../constants.ts";
import {
  calculatePortfolioTotals,
  calculateLotPerformanceSummary as calculateLotPerformanceSummary
} from "../../domain/calculations.ts";
import type { AppComputedObject } from "../context.ts";
import {
  pickBestForecastScenario,
  type ForecastScenario
} from "./forecast-scenarios.ts";
import {
  buildScenarioFromProjection,
  computeLotModeProjections,
  summarizeForecastAverage,
  type PortfolioModeProjection
} from "./portfolio-forecast.ts";

type PortfolioForecastScenario = ForecastScenario<"item" | "box" | "rtyh">;

export const portfolioComputed: Pick<
  AppComputedObject,
  "portfolioLotFilterItems" |
  "portfolioSelectedLotIds" |
  "portfolioForecastScenarios" |
  "averagePortfolioForecastScenario" |
  "bestPortfolioForecastScenario" |
  "allLotPerformance" |
  "portfolioTotals" |
  "hasPortfolioData"
> = {
  portfolioLotFilterItems() {
    return this.lots.map((lot) => ({ title: lot.name, value: lot.id }));
  },

  portfolioSelectedLotIds(): number[] {
    const allLotIds = this.lots.map((lot) => lot.id);
    const selectedIds = this.portfolioLotFilterIds.filter((id) => allLotIds.includes(id));
    return selectedIds.length > 0 ? selectedIds : allLotIds;
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

  allLotPerformance() {
    const selectedLotIds = Array.isArray(this.portfolioSelectedLotIds)
      ? this.portfolioSelectedLotIds
      : this.lots.map((lot) => lot.id);
    const selectedLotIdSet = new Set(selectedLotIds);

    const rows = this.lots
      .filter((lot) => selectedLotIdSet.has(lot.id))
      .map((lot) => {
        const sales = this.currentLotId === lot.id
          ? this.sales
          : this.loadSalesForLotId(lot.id);
        const summary = calculateLotPerformanceSummary(lot, sales, DEFAULT_VALUES.EXCHANGE_RATE);
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

        const lotType: "Bulk" | "Singles" = lot.lotType === "singles" ? "Singles" : "Bulk";
        return {
          ...summary,
          lotId: summary.lotId,
          lotName: summary.lotName,
          lotType,
          forecastProfitAverage: forecastSummary.forecastProfitAverage,
          forecastRevenueAverage: forecastSummary.forecastRevenueAverage,
          forecastScenarioCount: forecastSummary.forecastScenarioCount
        };
      });

    return rows.sort((a, b) => b.totalProfit - a.totalProfit);
  },

  portfolioTotals() {
    return calculatePortfolioTotals(this.allLotPerformance);
  },

  hasPortfolioData(): boolean {
    return this.allLotPerformance.length > 0;
  }
};
