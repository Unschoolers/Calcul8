import { DEFAULT_VALUES } from "../../constants.ts";
import {
  calculateBoxPriceCostCad,
  calculatePriceForUnits as calculateUnitPrice,
  calculateSalesProgress,
  calculateSalesStatus,
  calculateSoldPacksCount,
  calculateSparklineData,
  calculateSparklineGradient,
  calculateTotalCaseCost,
  calculateTotalPacks,
  calculateTotalSpots,
  calculateTotalRevenue
} from "../../domain/calculations.ts";
import type { AppComputedObject } from "../context.ts";
import {
  getSinglesEntryUnitCostInSellingCurrency,
  getSinglesRemainingQuantity,
  getTrackedSinglesSoldCount
} from "./singles-helpers.ts";
import {
  createForecastScenario,
  estimateNetRemainingFromUnitPrice,
  pickBestForecastScenario,
  type ForecastScenario
} from "./forecast-scenarios.ts";

type LiveForecastScenario = ForecastScenario<"item" | "box" | "rtyh" | "singles-suggested">;

function buildLiveForecastScenario(
  context: {
    totalRevenue: number;
    totalCaseCost: number;
    sellingTaxPercent: number;
    sellingShippingPerOrder: number;
    netFromGross: (grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number) => number;
  },
  payload: {
    id: LiveForecastScenario["id"];
    label: string;
    unitLabel: LiveForecastScenario["unitLabel"];
    units: number;
    unitPrice: number;
  }
): LiveForecastScenario {
  const units = Math.max(0, Number(payload.units) || 0);
  const unitPrice = Math.max(0, Number(payload.unitPrice) || 0);
  const estimatedNetRemaining = estimateNetRemainingFromUnitPrice({
    units,
    unitPrice,
    shippingPerOrder: context.sellingShippingPerOrder,
    netFromGross: context.netFromGross
  });
  return createForecastScenario(
    {
      baseRevenue: Math.max(0, Number(context.totalRevenue) || 0),
      baseCost: Math.max(0, Number(context.totalCaseCost) || 0)
    },
    {
      id: payload.id,
      label: payload.label,
      unitLabel: payload.unitLabel,
      units,
      unitPrice,
      estimatedNetRemaining
    }
  );
}

export const forecastComputed: Pick<
  AppComputedObject,
  "totalPacks" |
  "singlesTrackedSoldCount" |
  "singlesTrackedTotalCount" |
  "singlesUnlinkedSoldCount" |
  "totalSpots" |
  "boxPriceCostCAD" |
  "purchaseShippingCostCAD" |
  "purchaseCostInputLabel" |
  "purchaseCostInputValue" |
  "totalCaseCost" |
  "conversionInfo" |
  "soldPacksCount" |
  "totalRevenue" |
  "salesProgress" |
  "targetNetRevenue" |
  "remainingNetRevenueForTarget" |
  "remainingPacksCount" |
  "remainingBoxesEquivalent" |
  "remainingSpotsEquivalent" |
  "requiredPackPriceFromNow" |
  "requiredBoxPriceFromNow" |
  "requiredSpotPriceFromNow" |
  "liveForecastScenarios" |
  "bestLiveForecastScenario" |
  "salesStatus" |
  "sortedSales" |
  "sparklineData" |
  "sparklineGradient"
> = {
  totalPacks(): number {
    if (this.currentLotType === "singles") {
      const trackedInventoryTotal = Math.max(0, Number(this.singlesPurchaseTotalQuantity) || 0);
      const soldCardsFromAllSales = Array.isArray(this.sales)
        ? Math.max(0, calculateSoldPacksCount(this.sales))
        : 0;
      return Math.max(trackedInventoryTotal, soldCardsFromAllSales);
    }
    return calculateTotalPacks(this.boxesPurchased, this.packsPerBox, DEFAULT_VALUES.PACKS_PER_BOX);
  },

  singlesTrackedSoldCount(): number {
    if (this.currentLotType !== "singles") return 0;
    return getTrackedSinglesSoldCount(
      this.singlesPurchases,
      this.singlesSoldCountByPurchaseId
    );
  },

  singlesTrackedTotalCount(): number {
    if (this.currentLotType !== "singles") return 0;
    return Math.max(0, Number(this.singlesPurchaseTotalQuantity) || 0);
  },

  singlesUnlinkedSoldCount(): number {
    if (this.currentLotType !== "singles") return 0;
    const soldCards = Math.max(0, Number(this.soldPacksCount) || 0);
    const trackedSoldCards = Math.max(0, Number(this.singlesTrackedSoldCount) || 0);
    return Math.max(0, soldCards - trackedSoldCards);
  },

  totalSpots(): number {
    return calculateTotalSpots(this.boxesPurchased, this.spotsPerBox);
  },

  boxPriceCostCAD(): number {
    return calculateBoxPriceCostCad(
      this.boxPriceCost,
      this.currency,
      this.sellingCurrency,
      this.exchangeRate,
      DEFAULT_VALUES.EXCHANGE_RATE
    );
  },

  purchaseShippingCostCAD(): number {
    return calculateBoxPriceCostCad(
      this.purchaseShippingCost,
      this.currency,
      this.sellingCurrency,
      this.exchangeRate,
      DEFAULT_VALUES.EXCHANGE_RATE
    );
  },

  purchaseCostInputLabel(): string {
    return (this.purchaseUiMode === "simple" || this.costInputMode === "total")
      ? "Total Purchase"
      : "Price per Box (No Tax)";
  },

  purchaseCostInputValue: {
    get() {
      if (this.purchaseUiMode === "simple" || this.costInputMode === "total") {
        return (this.boxPriceCost || 0) * (this.boxesPurchased || 0);
      }
      return this.boxPriceCost || 0;
    },
    set(newValue) {
      const value = Number(newValue) || 0;
      if (this.purchaseUiMode === "simple" || this.costInputMode === "total") {
        const boxes = this.boxesPurchased || 0;
        this.boxPriceCost = boxes > 0 ? value / boxes : 0;
        return;
      }
      this.boxPriceCost = value;
    }
  },

  totalCaseCost(): number {
    if (this.currentLotType === "singles") {
      return this.singlesPurchaseTotalQuantity > 0 ? this.singlesPurchaseTotalCost : 0;
    }
    return calculateTotalCaseCost({
      boxesPurchased: this.boxesPurchased,
      pricePerBoxCad: this.boxPriceCostCAD,
      purchaseShippingCad: this.purchaseShippingCostCAD,
      purchaseTaxPercent: this.purchaseTaxPercent,
      includeTax: this.includeTax,
      currency: this.currency
    });
  },

  conversionInfo(): string {
    const hasSinglesConversion = this.currentLotType === "singles" && (this.singlesPurchases || []).some((entry) => {
      const entryCurrency = entry.currency === "USD" || entry.currency === "CAD"
        ? entry.currency
        : (this.currency === "USD" ? "USD" : "CAD");
      return entryCurrency !== this.sellingCurrency;
    });
    if (hasSinglesConversion || this.currency !== this.sellingCurrency) {
      const convertedTotal = this.currentLotType === "singles"
        ? this.singlesPurchaseTotalCost
        : (this.boxPriceCostCAD * (this.boxesPurchased || 0)) + this.purchaseShippingCostCAD;
      if (this.currentLotType === "singles") {
        return `Converted purchase costs to ${this.sellingCurrency}. ≈ $${this.formatCurrency(convertedTotal)} ${this.sellingCurrency} total`;
      }
      return `Converted purchase from ${this.currency} to ${this.sellingCurrency}. ≈ $${this.formatCurrency(convertedTotal)} ${this.sellingCurrency} total`;
    }
    return "";
  },

  soldPacksCount(): number {
    return calculateSoldPacksCount(Array.isArray(this.sales) ? this.sales : []);
  },

  totalRevenue(): number {
    return calculateTotalRevenue(this.sales, this.sellingTaxPercent);
  },

  salesProgress(): number {
    return calculateSalesProgress(this.soldPacksCount, this.totalPacks);
  },

  targetNetRevenue(): number {
    const targetProfit = (this.totalCaseCost * (Number(this.targetProfitPercent) || 0)) / 100;
    return this.totalCaseCost + targetProfit;
  },

  remainingNetRevenueForTarget(): number {
    return this.targetNetRevenue - this.totalRevenue;
  },

  remainingPacksCount(): number {
    return Math.max(0, this.totalPacks - this.soldPacksCount);
  },

  remainingBoxesEquivalent(): number {
    const packsPerBox = Number(this.packsPerBox) || 0;
    if (packsPerBox <= 0) return 0;
    return this.remainingPacksCount / packsPerBox;
  },

  remainingSpotsEquivalent(): number {
    if (this.totalPacks <= 0) return 0;
    return (this.remainingPacksCount / this.totalPacks) * this.totalSpots;
  },

  requiredPackPriceFromNow(): number | null {
    if (this.remainingNetRevenueForTarget <= 0) return 0;
    if (this.remainingPacksCount <= 0) return null;
    return calculateUnitPrice(
      this.remainingPacksCount,
      this.remainingNetRevenueForTarget,
      this.sellingTaxPercent,
      this.sellingShippingPerOrder
    );
  },

  requiredBoxPriceFromNow(): number | null {
    if (this.remainingNetRevenueForTarget <= 0) return 0;
    if (this.remainingBoxesEquivalent <= 0) return null;
    return calculateUnitPrice(
      this.remainingBoxesEquivalent,
      this.remainingNetRevenueForTarget,
      this.sellingTaxPercent,
      this.sellingShippingPerOrder
    );
  },

  requiredSpotPriceFromNow(): number | null {
    if (this.remainingNetRevenueForTarget <= 0) return 0;
    if (this.remainingSpotsEquivalent <= 0) return null;
    return calculateUnitPrice(
      this.remainingSpotsEquivalent,
      this.remainingNetRevenueForTarget,
      this.sellingTaxPercent,
      this.sellingShippingPerOrder
    );
  },

  liveForecastScenarios(): LiveForecastScenario[] {
    if (this.currentLotType === "singles") {
      const soldById = this.singlesSoldCountByPurchaseId || {};
      const targetProfitPercent = this.hasProAccess
        ? Math.max(0, Number(this.targetProfitPercent) || 0)
        : 0;
      let units = 0;
      let grossRemaining = 0;

      for (const entry of this.singlesPurchases || []) {
        const remainingQuantity = getSinglesRemainingQuantity(entry, soldById);
        if (remainingQuantity <= 0) continue;
        const marketValue = Math.max(0, Number(entry.marketValue) || 0);
        const unitBasis = marketValue > 0
          ? marketValue
          : getSinglesEntryUnitCostInSellingCurrency(
            entry,
            this.currency,
            this.sellingCurrency,
            this.exchangeRate
          );
        const targetNetRevenue = unitBasis * (1 + (targetProfitPercent / 100));
        const unitPrice = Math.max(0, this.calculatePriceForUnits(1, targetNetRevenue));
        units += remainingQuantity;
        grossRemaining += unitPrice * remainingQuantity;
      }

      if (units <= 0) return [];
      const averageUnitPrice = grossRemaining / units;
      return [
        buildLiveForecastScenario(this, {
          id: "singles-suggested",
          label: "Suggested item pricing",
          unitLabel: "item",
          units,
          unitPrice: averageUnitPrice
        })
      ];
    }

    return [
      buildLiveForecastScenario(this, {
        id: "item",
        label: "Item live price",
        unitLabel: "item",
        units: this.remainingPacksCount,
        unitPrice: this.livePackPrice
      }),
      buildLiveForecastScenario(this, {
        id: "box",
        label: "Box live price",
        unitLabel: "box",
        units: this.remainingBoxesEquivalent,
        unitPrice: this.liveBoxPriceSell
      }),
      buildLiveForecastScenario(this, {
        id: "rtyh",
        label: "RTYH live price",
        unitLabel: "spot",
        units: this.remainingSpotsEquivalent,
        unitPrice: this.liveSpotPrice
      })
    ].filter((scenario) => scenario.units > 0 || scenario.unitPrice > 0);
  },

  bestLiveForecastScenario(): LiveForecastScenario | null {
    return pickBestForecastScenario(this.liveForecastScenarios);
  },

  salesStatus() {
    if (this.currentLotType === "singles") {
      const profit = this.totalRevenue - this.totalCaseCost;
      if ((this.sales?.length ?? 0) === 0) {
        return { color: "grey", icon: "mdi-information", title: "No Sales Yet", profit: 0, revenue: 0 };
      }
      if (profit < 0) {
        return { color: "error", icon: "mdi-alert-circle", title: "Net Negative", profit, revenue: this.totalRevenue };
      }
      return { color: "success", icon: "mdi-check-circle", title: "Net Positive", profit, revenue: this.totalRevenue };
    }
    return calculateSalesStatus(this.totalRevenue, this.totalCaseCost, this.salesProgress);
  },

  sortedSales() {
    return [...this.sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  sparklineData(): number[] {
    return calculateSparklineData(this.sales, this.totalCaseCost, this.sellingTaxPercent);
  },

  sparklineGradient(): string[] {
    return calculateSparklineGradient(this.sales, this.totalCaseCost, this.sellingTaxPercent);
  }
};
