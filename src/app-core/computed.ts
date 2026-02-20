import { DEFAULT_VALUES } from "../constants.ts";
import { GOOGLE_PROFILE_CACHE_KEY, GOOGLE_TOKEN_KEY } from "./methods/ui/shared.ts";
import {
  calculateBoxPriceCostCad,
  calculateTotalSpots,
  calculatePriceForUnits as calculateUnitPrice,
  calculatePortfolioTotals,
  calculateLotPerformanceSummary as calculateLotPerformanceSummary,
  calculateSalesProgress,
  calculateSalesStatus,
  calculateSoldPacksCount,
  calculateSparklineData,
  calculateSparklineGradient,
  calculateTotalCaseCost,
  calculateTotalPacks,
  calculateTotalRevenue
} from "../domain/calculations.ts";
import type { AppComputedObject } from "./context.ts";

interface GoogleJwtPayload {
  name?: string;
  email?: string;
  picture?: string;
}

function decodeGoogleJwtPayload(idToken: string): GoogleJwtPayload | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;

  const payloadPart = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!payloadPart) return null;

  const padded = payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
  try {
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GoogleJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function readCachedGoogleProfile(): GoogleJwtPayload | null {
  try {
    const raw = localStorage.getItem(GOOGLE_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GoogleJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveGoogleProfile(idToken: string): GoogleJwtPayload {
  const fromToken = decodeGoogleJwtPayload(idToken) ?? {};
  const fromCache = readCachedGoogleProfile() ?? {};
  return {
    name: (fromToken.name || fromCache.name || "").trim(),
    email: (fromToken.email || fromCache.email || "").trim(),
    picture: (fromToken.picture || fromCache.picture || "").trim()
  };
}

export const appComputed: AppComputedObject = {
  isDark(): boolean {
    return this.$vuetify.theme.global.name === "unionArenaDark";
  },

  isGoogleSignedIn(): boolean {
    return Boolean((localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim());
  },

  googleProfileName(): string {
    const token = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!token) return "";
    return resolveGoogleProfile(token).name || "";
  },

  googleProfileEmail(): string {
    const token = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!token) return "";
    return resolveGoogleProfile(token).email || "";
  },

  googleProfilePicture(): string {
    const token = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!token) return "";
    return resolveGoogleProfile(token).picture || "";
  },

  lotNameDraft: {
    get() {
      return this.newLotName;
    },
    set(newValue) {
      this.newLotName = String(newValue ?? "");
    }
  },

  hasLotSelected(): boolean {
    return !!this.currentLotId;
  },

  canUsePaidActions(): boolean {
    return this.hasLotSelected && this.hasProAccess;
  },

  lotItems() {
    return [
      { title: "-- Select lot --", value: null },
      ...this.lots.map((lot) => ({ title: lot.name, value: lot.id }))
    ];
  },

  portfolioLotFilterItems() {
    return this.lots.map((lot) => ({ title: lot.name, value: lot.id }));
  },

  portfolioSelectedLotIds(): number[] {
    const allLotIds = this.lots.map((lot) => lot.id);
    const selectedIds = this.portfolioLotFilterIds.filter((id) => allLotIds.includes(id));
    return selectedIds.length > 0 ? selectedIds : allLotIds;
  },

  totalPacks(): number {
    return calculateTotalPacks(this.boxesPurchased, this.packsPerBox, DEFAULT_VALUES.PACKS_PER_BOX);
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
    if (this.currency !== this.sellingCurrency) {
      const convertedTotal = (this.boxPriceCostCAD * (this.boxesPurchased || 0)) + this.purchaseShippingCostCAD;
      return `Converted purchase from ${this.currency} to ${this.sellingCurrency}. ≈ $${this.formatCurrency(convertedTotal)} ${this.sellingCurrency} total`;
    }
    return "";
  },

  soldPacksCount(): number {
    return calculateSoldPacksCount(this.sales);
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

  salesStatus() {
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
        return {
          ...summary,
          lotId: summary.lotId,
          lotName: summary.lotName
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
