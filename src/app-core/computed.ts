import { DEFAULT_VALUES, WHATNOT_FEES } from "../constants.ts";
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

function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function getSinglesRemainingQuantity(
  entry: { id: number; quantity: number },
  soldByEntryId: Record<number, number> | undefined
): number {
  const totalQuantity = toNonNegativeInt(entry.quantity);
  const soldQuantity = toNonNegativeInt(soldByEntryId?.[entry.id]);
  return Math.max(0, totalQuantity - soldQuantity);
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

function calculateProfitableOrderPrice(
  targetNetRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder: number
): number {
  const targetNet = Math.max(0, Number(targetNetRevenue) || 0);
  if (targetNet <= 0) return 0;
  const buyerTaxRate = Math.max(0, Number(sellingTaxPercent) || 0) / 100;
  const shipping = Math.max(0, Number(buyerShippingPerOrder) || 0);
  const effectiveRate = 1 - WHATNOT_FEES.COMMISSION - (WHATNOT_FEES.PROCESSING * (1 + buyerTaxRate));
  if (effectiveRate <= 0) return 0;
  const fixedFees = WHATNOT_FEES.FIXED + (WHATNOT_FEES.PROCESSING * shipping);
  return (targetNet + fixedFees) / effectiveRate;
}

function getSinglesEntryUnitCostInSellingCurrency(
  entry: { cost: number; currency?: string },
  purchaseCurrency: "CAD" | "USD",
  sellingCurrency: "CAD" | "USD",
  exchangeRate: number
): number {
  const unitCost = Math.max(0, Number(entry.cost) || 0);
  const entryCurrency = entry.currency === "USD" || entry.currency === "CAD"
    ? entry.currency
    : purchaseCurrency;
  return calculateBoxPriceCostCad(
    unitCost,
    entryCurrency,
    sellingCurrency,
    exchangeRate,
    DEFAULT_VALUES.EXCHANGE_RATE
  );
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
    if (!Array.isArray(this.singlesPurchases) || this.singlesPurchases.length === 0) return 0;
    return this.singlesPurchases.reduce((sum, entry) => {
      const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
      const unitCost = Math.max(0, Number(entry.cost) || 0);
      const entryCurrency = entry.currency === "USD" || entry.currency === "CAD"
        ? entry.currency
        : (this.currency === "USD" ? "USD" : "CAD");
      const convertedUnitCost = calculateBoxPriceCostCad(
        unitCost,
        entryCurrency,
        this.sellingCurrency,
        this.exchangeRate,
        DEFAULT_VALUES.EXCHANGE_RATE
      );
      return sum + (convertedUnitCost * quantity);
    }, 0);
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
    const buyerShippingPerOrder = Math.max(0, Number(this.newSale?.buyerShipping) || 0);

    return (this.singlesPurchases || [])
      .filter((entry) => {
        const remainingQuantity = getSinglesRemainingQuantity(entry, soldCounts);
        if (remainingQuantity > 0) return true;
        return selectedEntryId != null && entry.id === selectedEntryId;
      })
      .map((entry) => {
        const totalQuantity = toNonNegativeInt(entry.quantity);
        const quantity = getSinglesRemainingQuantity(entry, soldCounts);
        const unitCost = Math.max(0, Number(entry.cost) || 0);
        const marketValue = Math.max(0, Number(entry.marketValue) || 0);
        const convertedUnitCost = getSinglesEntryUnitCostInSellingCurrency(
          entry,
          this.currency,
          this.sellingCurrency,
          this.exchangeRate
        );
        const cardNumber = String(entry.cardNumber || "").trim();
        const titleSuffix = cardNumber ? ` #${cardNumber}` : "";
        const remainingCostBasis = quantity * convertedUnitCost;
        return {
          title: `${entry.item || "Unnamed card"}${titleSuffix}`,
          value: entry.id,
          item: entry.item || "Unnamed card",
          cardNumber,
          cost: unitCost,
          marketValue,
          quantity,
          costBasis: totalQuantity * unitCost,
          profitablePrice: calculateProfitableOrderPrice(
            remainingCostBasis,
            this.sellingTaxPercent,
            buyerShippingPerOrder
          ),
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

    const soldCounts = this.singlesSoldCountByPurchaseId;
    const remainingQuantity = getSinglesRemainingQuantity(selectedEntry, soldCounts);
    const editingSelectedEntryId = toPositiveIntOrNull(this.editingSale?.singlesPurchaseEntryId);
    const editingQuantity = Math.max(0, Math.floor(Number(this.editingSale?.quantity) || 0));
    if (editingSelectedEntryId && editingSelectedEntryId === selectedEntryId) {
      return remainingQuantity + editingQuantity;
    }

    return remainingQuantity;
  },

  saleEditorProfitPreview() {
    if (this.currentLotType !== "singles" || !this.showAddSaleModal) return null;

    const grossRevenue = Math.max(0, Number(this.newSale?.price) || 0);
    const quantity = Math.max(0, Math.floor(Number(this.newSale?.quantity) || 0));
    const buyerShipping = Math.max(0, Number(this.newSale?.buyerShipping) || 0);
    const netRevenue = this.netFromGross(grossRevenue, buyerShipping, 1);

    const selectedEntryId = toPositiveIntOrNull(this.newSale?.singlesPurchaseEntryId);
    const selectedEntry = selectedEntryId
      ? (this.singlesPurchases || []).find((entry) => entry.id === selectedEntryId)
      : null;
    const unitCost = selectedEntry
      ? getSinglesEntryUnitCostInSellingCurrency(
        selectedEntry,
        this.currency,
        this.sellingCurrency,
        this.exchangeRate
      )
      : 0;
    const unitMarket = Math.max(0, Number(selectedEntry?.marketValue) || 0);
    const totalCost = unitCost * quantity;
    const totalMarket = unitMarket * quantity;
    const basisValue = totalMarket > 0 ? totalMarket : totalCost;
    const basisLabel = totalMarket > 0 ? "Market" as const : "Cost" as const;
    const basisProfit = netRevenue - basisValue;
    const percent = basisValue > 0
      ? (basisProfit / basisValue) * 100
      : (basisProfit >= 0 ? 100 : 0);

    return {
      value: basisProfit,
      percent,
      sign: basisProfit >= 0 ? "+" as const : "-" as const,
      colorClass: basisProfit >= 0 ? "text-success" : "text-error",
      basisLabel
    };
  },

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
        const lotType: "Bulk" | "Singles" = lot.lotType === "singles" ? "Singles" : "Bulk";
        return {
          ...summary,
          lotId: summary.lotId,
          lotName: summary.lotName,
          lotType
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
