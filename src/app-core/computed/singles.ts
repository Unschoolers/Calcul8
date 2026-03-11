import {
  calculateNetFromGross,
  calculateSinglesLineProfitPreview,
  calculateSinglesPurchaseTotals,
  calculateSinglesPurchaseTotalCostInSellingCurrency,
  calculateSinglesSaleProfitPreview
} from "../../domain/calculations.ts";
import type { AppComputedObject } from "../context.ts";
import {
  calculateProfitableOrderPrice,
  getSaleSinglesLines,
  getSinglesEntryUnitCostInSellingCurrency,
  getSinglesRemainingQuantity,
  normalizeLiveSelectionIds,
  normalizeSinglesCatalogSource,
  toNonNegativeInt,
  toPositiveIntOrNull
} from "./singles-helpers.ts";

type SaleEditorNormalizedLine = {
  singlesPurchaseEntryId: number | null;
  quantity: number;
  price: number;
};

type SaleEditorLineProfitPreview = {
  value: number;
  unitValue: number | null;
  quantity: number;
  percent: number;
  sign: "+" | "-";
  colorClass: string;
  basisLabel: "Market" | "Cost";
  basisValue: number;
  marketBasisValue: number;
  costBasisValue: number;
} | null;

function getSaleEditorNormalizedLines(newSale: {
  singlesItems?: Array<{ singlesPurchaseEntryId?: number | null; quantity?: number | null; price?: number | null }>;
  singlesPurchaseEntryId?: number | null;
  quantity?: number | null;
  price?: number | null;
}): SaleEditorNormalizedLine[] {
  const draftLines = Array.isArray(newSale?.singlesItems) && newSale.singlesItems.length > 0
    ? newSale.singlesItems
    : [{
      singlesPurchaseEntryId: newSale?.singlesPurchaseEntryId ?? null,
      quantity: newSale?.quantity ?? 0,
      price: newSale?.price ?? 0
    }];

  return draftLines.map((line) => ({
    singlesPurchaseEntryId: toPositiveIntOrNull(line.singlesPurchaseEntryId),
    quantity: toNonNegativeInt(line.quantity),
    price: Math.max(0, Number(line.price) || 0)
  }));
}

function getSaleEditorLineProfitPreviews(context: {
  currentLotType: string;
  showAddSaleModal: boolean;
  newSale: {
    singlesItems?: Array<{ singlesPurchaseEntryId?: number | null; quantity?: number | null; price?: number | null }>;
    singlesPurchaseEntryId?: number | null;
    quantity?: number | null;
    price?: number | null;
    buyerShipping?: number | null;
  };
  sellingTaxPercent: number;
  singlesPurchases: Array<{ id: number; marketValue: number; cost: number; currency?: string }>;
  currency: "CAD" | "USD";
  sellingCurrency: "CAD" | "USD";
  exchangeRate: number;
}): SaleEditorLineProfitPreview[] {
  if (context.currentLotType !== "singles" || !context.showAddSaleModal) return [];

  const normalizedLines = getSaleEditorNormalizedLines(context.newSale);
  const grossRevenue = normalizedLines.reduce((sum, line) => sum + line.price, 0);
  const buyerShipping = Math.max(0, Number(context.newSale?.buyerShipping) || 0);
  const netRevenue = calculateNetFromGross(grossRevenue, context.sellingTaxPercent, buyerShipping, 1);

  return normalizedLines.map((line): SaleEditorLineProfitPreview => {
    return calculateSinglesLineProfitPreview({
      line,
      grossRevenue,
      netRevenue,
      singlesPurchases: context.singlesPurchases,
      purchaseCurrency: context.currency,
      sellingCurrency: context.sellingCurrency,
      exchangeRate: context.exchangeRate
    });
  });
}

export const singlesComputed: Pick<
  AppComputedObject,
  "currentLotType" |
  "currentLotCatalogSource" |
  "hasLotSelected" |
  "isLiveTabDisabled" |
  "canUsePaidActions" |
  "lotItems" |
  "singlesPurchaseTotalQuantity" |
  "singlesPurchaseTotalCost" |
  "singlesPurchaseTotalMarketValue" |
  "singlesSoldCountByPurchaseId" |
  "effectiveLiveSinglesIds" |
  "effectiveLiveSinglesEntries" |
  "singlesSaleCardOptions" |
  "selectedSinglesSaleMaxQuantity" |
  "saleEditorLineProfitPreviews" |
  "saleEditorProfitPreview"
> = {
  currentLotType() {
    if (!this.currentLotId) return "bulk";
    const currentLot = this.lots.find((lot) => lot.id === this.currentLotId);
    return currentLot?.lotType === "singles" ? "singles" : "bulk";
  },

  currentLotCatalogSource(): "ua" | "pokemon" | "none" {
    if (!this.currentLotId) return "none";
    const currentLot = this.lots.find((lot) => lot.id === this.currentLotId);
    if (currentLot?.lotType !== "singles") return "none";
    return normalizeSinglesCatalogSource(currentLot.singlesCatalogSource);
  },

  hasLotSelected(): boolean {
    return !!this.currentLotId;
  },

  isLiveTabDisabled(): boolean {
    return !this.hasLotSelected;
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

  singlesPurchaseTotalQuantity(): number {
    return calculateSinglesPurchaseTotals(this.singlesPurchases).totalQuantity;
  },

  singlesPurchaseTotalCost(): number {
    return calculateSinglesPurchaseTotalCostInSellingCurrency({
      entries: this.singlesPurchases,
      purchaseCurrency: this.currency,
      sellingCurrency: this.sellingCurrency,
      exchangeRate: this.exchangeRate
    });
  },

  singlesPurchaseTotalMarketValue(): number {
    return calculateSinglesPurchaseTotals(this.singlesPurchases).totalMarketValue;
  },

  singlesSoldCountByPurchaseId(): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const sale of this.sales || []) {
      const saleLines = getSaleSinglesLines(sale);
      for (const line of saleLines) {
        const entryId = toPositiveIntOrNull(line.singlesPurchaseEntryId);
        if (!entryId) continue;
        const soldQuantity = toNonNegativeInt(line.quantity);
        if (soldQuantity <= 0) continue;
        counts[entryId] = (counts[entryId] || 0) + soldQuantity;
      }
    }
    return counts;
  },

  effectiveLiveSinglesIds(): number[] {
    if (this.currentLotType !== "singles") return [];

    const mergedIds = [
      ...normalizeLiveSelectionIds(this.liveSinglesManualIds),
      ...normalizeLiveSelectionIds(this.liveSinglesExternalIds)
    ];
    if (mergedIds.length === 0) return [];

    const validEntryIds = new Set(
      (this.singlesPurchases || [])
        .map((entry) => toPositiveIntOrNull(entry.id))
        .filter((entryId): entryId is number => entryId != null)
    );

    const filteredIds: number[] = [];
    const seenIds = new Set<number>();
    for (const id of mergedIds) {
      if (!validEntryIds.has(id) || seenIds.has(id)) continue;
      seenIds.add(id);
      filteredIds.push(id);
    }
    return filteredIds;
  },

  effectiveLiveSinglesEntries() {
    if (this.currentLotType !== "singles") return [];
    const ids = this.effectiveLiveSinglesIds;
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const entryById = new Map(
      (this.singlesPurchases || []).map((entry) => [Number(entry.id), entry])
    );
    const resolvedEntries = [] as typeof this.singlesPurchases;
    for (const id of ids) {
      const entry = entryById.get(id);
      if (!entry) continue;
      resolvedEntries.push(entry);
    }
    return resolvedEntries;
  },

  singlesSaleCardOptions() {
    if (this.currentLotType !== "singles") return [];

    const selectedEntryIds = new Set<number>();
    const selectedEntryId = toPositiveIntOrNull(this.newSale?.singlesPurchaseEntryId);
    if (selectedEntryId) selectedEntryIds.add(selectedEntryId);
    if (Array.isArray(this.newSale?.singlesItems)) {
      for (const line of this.newSale.singlesItems) {
        const lineEntryId = toPositiveIntOrNull(line.singlesPurchaseEntryId);
        if (lineEntryId) selectedEntryIds.add(lineEntryId);
      }
    }
    const soldCounts = this.singlesSoldCountByPurchaseId;
    const buyerShippingPerOrder = Math.max(0, Number(this.newSale?.buyerShipping) || 0);

    return (this.singlesPurchases || [])
      .filter((entry) => {
        const remainingQuantity = getSinglesRemainingQuantity(entry, soldCounts);
        if (remainingQuantity > 0) return true;
        return selectedEntryIds.has(entry.id);
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
          title: `${entry.item || "Unnamed item"}${titleSuffix}`,
          value: entry.id,
          item: entry.item || "Unnamed item",
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

    const firstLine = Array.isArray(this.newSale?.singlesItems) && this.newSale.singlesItems.length > 0
      ? this.newSale.singlesItems[0]
      : null;
    const selectedEntryId = toPositiveIntOrNull(firstLine?.singlesPurchaseEntryId ?? this.newSale?.singlesPurchaseEntryId);
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

  saleEditorLineProfitPreviews() {
    return getSaleEditorLineProfitPreviews(this);
  },

  saleEditorProfitPreview() {
    if (this.currentLotType !== "singles" || !this.showAddSaleModal) return null;

    const linePreviewSource = Array.isArray(this.saleEditorLineProfitPreviews)
      ? this.saleEditorLineProfitPreviews
      : getSaleEditorLineProfitPreviews(this);
    return calculateSinglesSaleProfitPreview(linePreviewSource || []);
  }
};
