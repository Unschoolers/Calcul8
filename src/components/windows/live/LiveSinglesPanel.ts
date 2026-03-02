import template from "./LiveSinglesPanel.html?raw";
import "./LiveSinglesPanel.css";
import { inject, type PropType } from "vue";
import type { SinglesPurchaseEntry } from "../../../types/app.ts";
import { DEFAULT_VALUES } from "../../../constants.ts";
import { STORAGE_KEYS } from "../../../app-core/storageKeys.ts";
import { calculateBoxPriceCostCad } from "../../../domain/calculations.ts";
import { createWindowContextBridge } from "../contextBridge.ts";

type LiveSinglesAutocompleteItem = {
  title: string;
  value: number;
  subtitle: string;
};

type LiveSinglesPricingMode = "individual" | "bundle";

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function toWholeNonNegative(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isLiveSinglesPricingMode(value: unknown): value is LiveSinglesPricingMode {
  return value === "individual" || value === "bundle";
}

export const LiveSinglesPanel = {
  name: "LiveSinglesPanel",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: false,
      default: undefined
    }
  },
  data() {
    return {
      liveSinglesSelectedId: null as number | null,
      liveSinglesPricingMode: "individual" as LiveSinglesPricingMode,
      liveSinglesIndividualPrices: {} as Record<number, number>,
      liveSinglesBundlePrice: null as number | null,
      liveSinglesBundleSelectionKey: ""
    };
  },
  computed: {
    liveSinglesAutocompleteItems(this: any): LiveSinglesAutocompleteItem[] {
      if (this.currentLotType !== "singles") return [];

      const selectedIdSet = new Set(
        (this.effectiveLiveSinglesIds || [])
          .map((value: unknown) => toPositiveInt(value))
          .filter((value: number | null): value is number => value != null)
      );
      const soldById = (this.singlesSoldCountByPurchaseId || {}) as Record<number, number>;

      return (this.singlesPurchases || [])
        .map((entry: SinglesPurchaseEntry) => {
          const entryId = toPositiveInt(entry.id);
          if (!entryId) return null;

          const totalQuantity = toWholeNonNegative(entry.quantity);
          const soldQuantity = toWholeNonNegative(soldById[entryId]);
          const remainingQuantity = Math.max(0, totalQuantity - soldQuantity);
          if (remainingQuantity <= 0 && !selectedIdSet.has(entryId)) return null;

          const itemName = String(entry.item || "").trim() || "Unnamed item";
          const cardNumber = String(entry.cardNumber || "").trim();
          const title = cardNumber ? `${itemName} #${cardNumber}` : itemName;
          return {
            title,
            value: entryId,
            subtitle: `${remainingQuantity}/${totalQuantity} in stock`
          } satisfies LiveSinglesAutocompleteItem;
        })
        .filter((item): item is LiveSinglesAutocompleteItem => item != null)
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    },

    hasLiveSinglesSelection(this: any): boolean {
      return Array.isArray(this.effectiveLiveSinglesIds) && this.effectiveLiveSinglesIds.length > 0;
    },

    liveSinglesSelectedCount(this: any): number {
      return Array.isArray(this.effectiveLiveSinglesEntries) ? this.effectiveLiveSinglesEntries.length : 0;
    },

    liveSinglesBasisTotal(this: any): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + this.resolveEntryBasis(entry);
      }, 0);
    },

    liveSinglesSuggestedBundlePrice(this: any): number {
      if (!this.hasLiveSinglesSelection) return 0;
      const targetProfitPercent = Math.max(0, Number(this.targetProfitPercent) || 0);
      const targetNetRevenue = this.liveSinglesBasisTotal * (1 + (targetProfitPercent / 100));
      const calculatePrice = this.calculatePriceForUnits;
      if (typeof calculatePrice !== "function") return roundCurrency(targetNetRevenue);
      return Math.max(0, calculatePrice(1, targetNetRevenue));
    },

    liveSinglesEffectiveBundlePrice(this: any): number {
      const draftedBundle = Number(this.liveSinglesBundlePrice);
      if (Number.isFinite(draftedBundle) && draftedBundle >= 0) {
        return draftedBundle;
      }
      return this.liveSinglesSuggestedBundlePrice;
    },

    liveSinglesBundleProfit(this: any): number {
      if (!this.hasLiveSinglesSelection) return 0;
      const netFromGross = this.netFromGross;
      const bundlePrice = this.liveSinglesEffectiveBundlePrice;
      const netRevenue = typeof netFromGross === "function"
        ? netFromGross(bundlePrice, this.sellingShippingPerOrder, 1)
        : bundlePrice;
      return netRevenue - this.liveSinglesBasisTotal;
    },

    liveSinglesBundleProfitPercent(this: any): number {
      const basisTotal = Math.max(0, Number(this.liveSinglesBasisTotal) || 0);
      const profit = Number(this.liveSinglesBundleProfit) || 0;
      if (basisTotal <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basisTotal) * 100;
    },

    liveSinglesIndividualTotalPrice(this: any): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + this.getIndividualPrice(entry);
      }, 0);
    },

    liveSinglesIndividualTotalProfit(this: any): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + this.getIndividualProfit(entry);
      }, 0);
    },

    liveSinglesIndividualTotalProfitPercent(this: any): number {
      const basisTotal = Math.max(0, Number(this.liveSinglesBasisTotal) || 0);
      const profit = Number(this.liveSinglesIndividualTotalProfit) || 0;
      if (basisTotal <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basisTotal) * 100;
    },

    liveSinglesBundleAllocations(this: any): Array<{
      id: number;
      share: number;
      percent: number;
    }> {
      if (!Array.isArray(this.effectiveLiveSinglesEntries) || this.effectiveLiveSinglesEntries.length === 0) return [];

      const bundlePrice = this.liveSinglesEffectiveBundlePrice;
      const basisByEntry = this.effectiveLiveSinglesEntries.map((entry: SinglesPurchaseEntry) => ({
        id: entry.id,
        basis: this.resolveEntryBasis(entry)
      }));
      const totalBasis = basisByEntry.reduce((sum: number, entry) => sum + entry.basis, 0);
      const equalShare = basisByEntry.length > 0 ? (bundlePrice / basisByEntry.length) : 0;

      return basisByEntry.map((entry) => {
        const ratio = totalBasis > 0 ? entry.basis / totalBasis : (basisByEntry.length > 0 ? 1 / basisByEntry.length : 0);
        const share = totalBasis > 0 ? bundlePrice * ratio : equalShare;
        return {
          id: entry.id,
          share: roundCurrency(share),
          percent: Math.max(0, ratio * 100)
        };
      });
    }
  },
  methods: {
    fmtCurrency(this: any, value: number | null | undefined, decimals = 2): string {
      const formatter = this.safeFixed;
      if (typeof formatter === "function") {
        return formatter(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    },

    getStockLabel(this: any, entry: SinglesPurchaseEntry): string {
      const totalQuantity = toWholeNonNegative(entry.quantity);
      const soldById = (this.singlesSoldCountByPurchaseId || {}) as Record<number, number>;
      const soldQuantity = toWholeNonNegative(soldById[entry.id]);
      const remainingQuantity = Math.max(0, totalQuantity - soldQuantity);
      return `${remainingQuantity}/${totalQuantity}`;
    },

    getEntryCostInSellingCurrency(this: any, entry: SinglesPurchaseEntry): number {
      const unitCost = toNonNegativeNumber(entry.cost);
      const entryCurrency = entry.currency === "USD" || entry.currency === "CAD"
        ? entry.currency
        : (this.currency === "USD" ? "USD" : "CAD");
      return calculateBoxPriceCostCad(
        unitCost,
        entryCurrency,
        this.sellingCurrency,
        this.exchangeRate,
        DEFAULT_VALUES.EXCHANGE_RATE
      );
    },

    resolveEntryBasis(this: any, entry: SinglesPurchaseEntry): number {
      const marketValue = toNonNegativeNumber(entry.marketValue);
      if (marketValue > 0) return marketValue;
      return this.getEntryCostInSellingCurrency(entry);
    },

    getSuggestedIndividualPrice(this: any, entry: SinglesPurchaseEntry): number {
      const basis = this.resolveEntryBasis(entry);
      const targetProfitPercent = Math.max(0, Number(this.targetProfitPercent) || 0);
      const targetNetRevenue = basis * (1 + (targetProfitPercent / 100));
      const calculatePrice = this.calculatePriceForUnits;
      if (typeof calculatePrice !== "function") return roundCurrency(targetNetRevenue);
      return Math.max(0, calculatePrice(1, targetNetRevenue));
    },

    syncLiveSinglesPricingState(this: any): void {
      const selectedIds = Array.isArray(this.effectiveLiveSinglesIds)
        ? this.effectiveLiveSinglesIds
        : [];
      const selectionKey = selectedIds.join(",");
      const selectedSet = new Set(
        selectedIds
          .map((value: unknown) => toPositiveInt(value))
          .filter((value: number | null): value is number => value != null)
      );
      const existingPrices = this.liveSinglesIndividualPrices as Record<number, number>;
      const nextPrices: Record<number, number> = {};
      for (const [rawId, rawPrice] of Object.entries(existingPrices)) {
        const entryId = toPositiveInt(rawId);
        if (!entryId || !selectedSet.has(entryId)) continue;
        const parsedPrice = Number(rawPrice);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) continue;
        nextPrices[entryId] = roundCurrency(parsedPrice);
      }

      for (const entry of (this.effectiveLiveSinglesEntries || []) as SinglesPurchaseEntry[]) {
        if (nextPrices[entry.id] != null) continue;
        nextPrices[entry.id] = this.getSuggestedIndividualPrice(entry);
      }
      this.liveSinglesIndividualPrices = nextPrices;

      if (selectedSet.size === 0) {
        this.liveSinglesBundlePrice = null;
        this.liveSinglesBundleSelectionKey = "";
        return;
      }

      const selectionChanged = this.liveSinglesBundleSelectionKey !== selectionKey;
      if (selectionChanged) {
        this.liveSinglesBundleSelectionKey = selectionKey;
        this.liveSinglesBundlePrice = this.liveSinglesSuggestedBundlePrice;
        return;
      }

      if (this.liveSinglesBundlePrice == null || Number.isNaN(Number(this.liveSinglesBundlePrice))) {
        this.liveSinglesBundlePrice = this.liveSinglesSuggestedBundlePrice;
      }
    },

    getIndividualPrice(this: any, entry: SinglesPurchaseEntry): number {
      const parsedId = toPositiveInt(entry.id);
      if (!parsedId) return 0;
      const currentPrice = Number(this.liveSinglesIndividualPrices[parsedId]);
      if (Number.isFinite(currentPrice) && currentPrice >= 0) {
        return currentPrice;
      }
      const suggested = this.getSuggestedIndividualPrice(entry);
      this.liveSinglesIndividualPrices = {
        ...this.liveSinglesIndividualPrices,
        [parsedId]: suggested
      };
      return suggested;
    },

    getIndividualProfit(this: any, entry: SinglesPurchaseEntry): number {
      const price = this.getIndividualPrice(entry);
      const netFromGross = this.netFromGross;
      const netRevenue = typeof netFromGross === "function"
        ? netFromGross(price, this.sellingShippingPerOrder, 1)
        : price;
      return netRevenue - this.resolveEntryBasis(entry);
    },

    getIndividualProfitPercent(this: any, entry: SinglesPurchaseEntry): number {
      const basis = Math.max(0, Number(this.resolveEntryBasis(entry)) || 0);
      const profit = Number(this.getIndividualProfit(entry)) || 0;
      if (basis <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basis) * 100;
    },

    getBundleAllocationForEntry(this: any, entryId: number): { id: number; share: number; percent: number } | null {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return null;
      return (this.liveSinglesBundleAllocations || []).find((allocation: { id: number }) => allocation.id === parsedId) || null;
    },

    onIndividualPriceInput(this: any, entryId: number, value: unknown): void {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return;
      const parsedPrice = Number(value);
      this.liveSinglesIndividualPrices = {
        ...this.liveSinglesIndividualPrices,
        [parsedId]: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? roundCurrency(parsedPrice) : 0
      };
    },

    adjustIndividualPrice(this: any, entryId: number, direction: -1 | 1): void {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return;
      const step = 1;
      const existing = Number(this.liveSinglesIndividualPrices[parsedId]);
      let current = Number.isFinite(existing) && existing >= 0 ? existing : 0;
      if (!(Number.isFinite(existing) && existing >= 0)) {
        const entry = (this.effectiveLiveSinglesEntries || [])
          .find((candidate: SinglesPurchaseEntry) => candidate.id === parsedId);
        if (entry) {
          current = this.getIndividualPrice(entry);
        }
      }
      const next = Math.max(0, roundCurrency(current + (direction * step)));
      this.onIndividualPriceInput(parsedId, next);
    },

    adjustBundlePrice(this: any, direction: -1 | 1): void {
      const step = 1;
      const current = toNonNegativeNumber(this.liveSinglesEffectiveBundlePrice);
      const next = Math.max(0, roundCurrency(current + (direction * step)));
      this.liveSinglesBundlePrice = next;
    },

    addLiveSinglesFromPicker(this: any): void {
      const selectedId = toPositiveInt(this.liveSinglesSelectedId);
      if (!selectedId) return;
      this.addLiveSinglesSelection(selectedId, "manual");
      this.liveSinglesSelectedId = null;
    },

    removeLiveSinglesEntry(this: any, entryId: number): void {
      this.removeLiveSinglesSelection(entryId, "manual");
      this.removeLiveSinglesSelection(entryId, "external");
    },

    clearLiveSinglesEntries(this: any): void {
      this.clearLiveSinglesSelection();
      this.liveSinglesIndividualPrices = {};
      this.liveSinglesBundlePrice = null;
      this.liveSinglesBundleSelectionKey = "";
    },

    panelApplySuggestedLiveSinglesPricing(this: any): void {
      const entries = Array.isArray(this.effectiveLiveSinglesEntries)
        ? this.effectiveLiveSinglesEntries as SinglesPurchaseEntry[]
        : [];

      if (entries.length === 0) {
        this.liveSinglesIndividualPrices = {};
        this.liveSinglesBundlePrice = null;
        this.liveSinglesBundleSelectionKey = "";
        return;
      }

      const nextPrices: Record<number, number> = {};
      for (const entry of entries) {
        const entryId = toPositiveInt(entry.id);
        if (!entryId) continue;
        nextPrices[entryId] = this.getSuggestedIndividualPrice(entry);
      }

      this.liveSinglesIndividualPrices = nextPrices;
      this.liveSinglesBundleSelectionKey = entries
        .map((entry) => toPositiveInt(entry.id))
        .filter((entryId: number | null): entryId is number => entryId != null)
        .join(",");
      this.liveSinglesBundlePrice = this.liveSinglesSuggestedBundlePrice;
    },

    panelResetLiveSinglesPricing(this: any): void {
      this.panelApplySuggestedLiveSinglesPricing();
    },

    loadLiveSinglesModeFromStorage(this: any): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.LIVE_SINGLES_MODE);
        if (!isLiveSinglesPricingMode(raw)) return;
        this.liveSinglesPricingMode = raw;
      } catch {
        // Ignore storage read errors.
      }
    },

    persistLiveSinglesMode(this: any): void {
      try {
        localStorage.setItem(STORAGE_KEYS.LIVE_SINGLES_MODE, this.liveSinglesPricingMode);
      } catch {
        // Ignore storage write errors.
      }
    }
  },
  watch: {
    effectiveLiveSinglesIds: {
      handler(this: any): void {
        this.syncLiveSinglesPricingState();
      },
      immediate: true
    },
    liveSinglesPricingMode(this: any): void {
      this.persistLiveSinglesMode();
    }
  },
  mounted(this: any) {
    this.loadLiveSinglesModeFromStorage();
  },
  setup(props: { ctx?: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx ?? {}) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
