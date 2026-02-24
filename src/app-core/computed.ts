import { DEFAULT_VALUES } from "../constants.ts";
import { GOOGLE_PROFILE_CACHE_KEY, GOOGLE_TOKEN_KEY } from "./methods/ui/shared.ts";
import {
  calculateBoxPriceCostCad,
  calculateSinglesPurchaseTotals,
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

function toPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function getTrackedSinglesSoldCount(
  entries: Array<{ id: number }> | undefined,
  soldByEntryId: Record<number, number> | undefined
): number {
  const existingEntryIds = new Set(
    (entries || [])
      .map((entry) => Number(entry.id))
      .filter((entryId) => Number.isFinite(entryId) && entryId > 0)
  );

  return Object.entries(soldByEntryId || {})
    .reduce((sum, [entryId, value]) => {
      const numericEntryId = Number(entryId);
      if (!existingEntryIds.has(numericEntryId)) return sum;
      return sum + Math.max(0, Math.floor(Number(value) || 0));
    }, 0);
}

export const appComputed: AppComputedObject = {
  isDark(): boolean {
    return this.$vuetify.theme.global.name === "unionArenaDark";
  },

  isGoogleSignedIn(): boolean {
    void this.googleAuthEpoch;
    return Boolean((localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim());
  },

  googleProfileName(): string {
    void this.googleAuthEpoch;
    const token = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!token) return "";
    return resolveGoogleProfile(token).name || "";
  },

  googleProfileEmail(): string {
    void this.googleAuthEpoch;
    const token = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!token) return "";
    return resolveGoogleProfile(token).email || "";
  },

  googleProfilePicture(): string {
    void this.googleAuthEpoch;
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

  currentLotType() {
    if (!this.currentLotId) return "bulk";
    const currentLot = this.lots.find((lot) => lot.id === this.currentLotId);
    return currentLot?.lotType === "singles" ? "singles" : "bulk";
  },

  hasLotSelected(): boolean {
    return !!this.currentLotId;
  },

  isLiveTabDisabled(): boolean {
    return !this.hasLotSelected || this.currentLotType === "singles";
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

  singlesPurchaseTotalQuantity(): number {
    return calculateSinglesPurchaseTotals(this.singlesPurchases).totalQuantity;
  },

  singlesPurchaseTotalCost(): number {
    return calculateSinglesPurchaseTotals(this.singlesPurchases).totalCost;
  },

  singlesPurchaseTotalMarketValue(): number {
    return calculateSinglesPurchaseTotals(this.singlesPurchases).totalMarketValue;
  },

  singlesSoldCountByPurchaseId(): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const sale of this.sales || []) {
      const entryId = toPositiveIntOrNull(sale.singlesPurchaseEntryId);
      if (!entryId) continue;
      const soldQuantity = Math.max(0, Math.floor(Number(sale.quantity) || 0));
      if (soldQuantity <= 0) continue;
      counts[entryId] = (counts[entryId] || 0) + soldQuantity;
    }
    return counts;
  },

  singlesSaleCardOptions() {
    if (this.currentLotType !== "singles") return [];

    const selectedEntryId = toPositiveIntOrNull(this.newSale?.singlesPurchaseEntryId);
    const soldCounts = this.singlesSoldCountByPurchaseId;

    return (this.singlesPurchases || [])
      .filter((entry) => {
        const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
        if (quantity > 0) return true;
        return selectedEntryId != null && entry.id === selectedEntryId;
      })
      .map((entry) => {
        const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
        const unitCost = Math.max(0, Number(entry.cost) || 0);
        const marketValue = Math.max(0, Number(entry.marketValue) || 0);
        const cardNumber = String(entry.cardNumber || "").trim();
        const titleSuffix = cardNumber ? ` #${cardNumber}` : "";
        return {
          title: `${entry.item || "Unnamed card"}${titleSuffix}`,
          value: entry.id,
          item: entry.item || "Unnamed card",
          cardNumber,
          cost: unitCost,
          marketValue,
          quantity,
          costBasis: quantity * unitCost,
          soldCount: soldCounts[entry.id] || 0
        };
      })
      .sort((a, b) => a.item.localeCompare(b.item));
  },

  selectedSinglesSaleMaxQuantity(): number | null {
    if (this.currentLotType !== "singles") return null;

    const selectedEntryId = toPositiveIntOrNull(this.newSale?.singlesPurchaseEntryId);
    if (!selectedEntryId) return null;

    const selectedEntry = (this.singlesPurchases || []).find((entry) => entry.id === selectedEntryId);
    if (!selectedEntry) return null;

    const remainingQuantity = Math.max(0, Math.floor(Number(selectedEntry.quantity) || 0));
    const editingSelectedEntryId = toPositiveIntOrNull(this.editingSale?.singlesPurchaseEntryId);
    const editingQuantity = Math.max(0, Math.floor(Number(this.editingSale?.quantity) || 0));
    if (editingSelectedEntryId && editingSelectedEntryId === selectedEntryId) {
      return remainingQuantity + editingQuantity;
    }

    return remainingQuantity;
  },

  totalPacks(): number {
    if (this.currentLotType === "singles") {
      const remainingCards = Math.max(0, Number(this.singlesPurchaseTotalQuantity) || 0);
      const soldCardsFromLinkedRows = getTrackedSinglesSoldCount(
        this.singlesPurchases,
        this.singlesSoldCountByPurchaseId
      );
      const soldCardsFromAllSales = Array.isArray(this.sales)
        ? Math.max(0, calculateSoldPacksCount(this.sales))
        : 0;
      const trackedInventoryTotal = remainingCards + soldCardsFromLinkedRows;
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
    const remainingCards = Math.max(0, Number(this.singlesPurchaseTotalQuantity) || 0);
    return remainingCards + this.singlesTrackedSoldCount;
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
    if (this.currency !== this.sellingCurrency) {
      const convertedTotal = (this.boxPriceCostCAD * (this.boxesPurchased || 0)) + this.purchaseShippingCostCAD;
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
          lotName: summary.lotName,
          lotType: lot.lotType === "singles" ? "Singles" : "Bulk"
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
