import { inject, type PropType } from "vue";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import { compareLocalizedText } from "../../../app-core/i18n/index.ts";
import {
    toNonNegativeNumber,
    toPositiveIntOrNull as toPositiveInt,
    toNonNegativeInt as toWholeNonNegative
} from "../../../app-core/shared/singles-normalizers.ts";
import {
  resolveVuetifySlotNumber,
  resolveVuetifySlotString,
  resolveVuetifySlotValue
} from "../../../app-core/shared/vuetify-slot-items.ts";
import { STORAGE_KEYS } from "../../../app-core/storageKeys.ts";
import { DEFAULT_VALUES } from "../../../constants.ts";
import { calculateBoxPriceCostCad, getSinglesEntryUnitMarketValueInSellingCurrency } from "../../../domain/calculations.ts";
import type { CurrencyCode, SinglesPurchaseEntry, SinglesSaleLine } from "../../../types/app.ts";
import { createWindowContextBridge } from "../shared/contextBridge.ts";
import "./LiveSinglesPanel.css";

type LiveSinglesAutocompleteItem = {
  title: string;
  value: number;
  subtitle: string;
  name: string;
  cardNumber: string;
  image: string;
  searchText: string;
};

type LiveSinglesPricingMode = "individual" | "bundle";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isLiveSinglesPricingMode(value: unknown): value is LiveSinglesPricingMode {
  return value === "individual" || value === "bundle";
}

function normalizeLiveSinglesSearchValue(value: unknown): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type LiveSinglesPanelThis = {
  // ===== Local data =====
  liveSinglesSelectedId: number | null;
  liveSinglesSearchText: string;
  liveSinglesPricingMode: LiveSinglesPricingMode;
  liveSinglesQuantities: Record<number, number>;
  liveSinglesIndividualPrices: Record<number, number>;
  liveSinglesBundlePrice: number | null;
  liveSinglesBundleSelectionKey: string;
  liveSinglesImagePreviewOpen: boolean;
  liveSinglesImagePreviewSrc: string;
  liveSinglesImagePreviewTitle: string;

  // ===== AppContext bridge =====
  ctx: Record<string, unknown> | undefined;
  $root: Record<string, unknown> | undefined;
  currentLotType: string;
  singlesPurchases: SinglesPurchaseEntry[];
  singlesSoldCountByPurchaseId: Record<number, number>;
  effectiveLiveSinglesIds: number[];
  effectiveLiveSinglesEntries: SinglesPurchaseEntry[];
  targetProfitPercent: number;
  sellingShippingPerOrder: number;
  sellingCurrency: CurrencyCode;
  currency: CurrencyCode;
  exchangeRate: number;
  preferredLanguage: string;
  calculatePriceForUnits: ((units: number, netRevenue: number) => number) | unknown;
  netFromGross: ((price: number, shipping: number, units: number) => number) | unknown;
  formatCurrency: ((value: number | null | undefined, decimals?: number) => string) | unknown;
  safeFixed: ((value: number | null | undefined, decimals?: number) => string) | unknown;

  // ===== Computed =====
  liveSinglesAutocompleteItems: LiveSinglesAutocompleteItem[];
  hasLiveSinglesSelection: boolean;
  liveSinglesSelectedCount: number;
  liveSinglesBasisTotal: number;
  liveSinglesSuggestedBundlePrice: number;
  liveSinglesEffectiveBundlePrice: number;
  liveSinglesBundleProfit: number;
  liveSinglesBundleProfitPercent: number;
  liveSinglesIndividualTotalPrice: number;
  liveSinglesIndividualTotalProfit: number;
  liveSinglesIndividualTotalProfitPercent: number;
  liveSinglesBundleAllocations: Array<{ id: number; share: number; percent: number }>;

  // ===== Methods =====
  t(key: string, fallback?: string): string;
  fmtCurrency(value: number | null | undefined, decimals?: number): string;
  getStockLabel(entry: SinglesPurchaseEntry): string;
  getLiveSinglesEntryMaxQuantity(entry: SinglesPurchaseEntry): number;
  getLiveSinglesEntryQuantity(entry: SinglesPurchaseEntry): number;
  setLiveSinglesEntryQuantity(entryId: number, nextQuantity: unknown): void;
  getEntryCostInSellingCurrency(entry: SinglesPurchaseEntry): number;
  getEntryMarketValueInSellingCurrency(entry: SinglesPurchaseEntry): number;
  resolveEntryBasis(entry: SinglesPurchaseEntry): number;
  getIndividualPrice(entry: SinglesPurchaseEntry): number;
  getIndividualProfit(entry: SinglesPurchaseEntry): number;
  getSuggestedIndividualPrice(entry: SinglesPurchaseEntry): number;
  getBundleAllocationForEntry(entryId: number): { id: number; share: number; percent: number } | null;
  getSinglesEntryMarketTotalInSellingCurrency(entry: SinglesPurchaseEntry): number;
  onIndividualPriceInput(entryId: number, value: unknown): void;
  addLiveSinglesSelection(id: number, source?: string): void;
  removeLiveSinglesSelection(id: number, source?: string): void;
  clearLiveSinglesSelection(): void;
  openConvertLiveSinglesSaleModal(lines: SinglesSaleLine[], options?: { buyerShipping?: number }): void;
  panelApplySuggestedLiveSinglesPricing(): void;
  panelResetLiveSinglesPricing(): void;
  syncLiveSinglesPricingState(): void;
  loadLiveSinglesModeFromStorage(): void;
  persistLiveSinglesMode(): void;
  onLiveSinglesPickerSelection(value: unknown): void;
  addLiveSinglesFromPicker(): void;
  removeLiveSinglesEntry(entryId: number): void;
  clearLiveSinglesEntries(): void;
  convertLiveSinglesToSale(): void;
  adjustIndividualPrice(entry: SinglesPurchaseEntry, direction: -1 | 1): void;
  adjustBundlePrice(direction: -1 | 1): void;
  openLiveSinglesImagePreview(entry: SinglesPurchaseEntry): void;
  closeLiveSinglesImagePreview(): void;
  onLiveSinglesImagePreviewModelValue(value: boolean): void;
  getBundleAllocationForEntry(entryId: number): { id: number; share: number; percent: number } | null;
};

export const LiveSinglesPanel = {
  name: "LiveSinglesPanel",
  components: {
    AppActionButton,
    AppMetricValue
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: false,
      default: (): undefined => undefined
    }
  },
  data() {
    return {
      liveSinglesSelectedId: null as number | null,
      liveSinglesSearchText: "",
      liveSinglesPricingMode: "bundle" as LiveSinglesPricingMode,
      liveSinglesQuantities: {} as Record<number, number>,
      liveSinglesIndividualPrices: {} as Record<number, number>,
      liveSinglesBundlePrice: null as number | null,
      liveSinglesBundleSelectionKey: "",
      liveSinglesImagePreviewOpen: false,
      liveSinglesImagePreviewSrc: "",
      liveSinglesImagePreviewTitle: ""
    };
  },
  computed: {
    liveSinglesAutocompleteItems(this: LiveSinglesPanelThis): LiveSinglesAutocompleteItem[] {
      if (this.currentLotType !== "singles") return [];

      const selectedIdSet = new Set(
        (this.effectiveLiveSinglesIds || [])
          .map((value: unknown) => toPositiveInt(value))
          .filter((value: number | null): value is number => value != null)
      );
      const soldById = (this.singlesSoldCountByPurchaseId || {}) as Record<number, number>;
      const normalizedQuery = normalizeLiveSinglesSearchValue(this.liveSinglesSearchText);
      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

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
          const marketValue = this.getEntryMarketValueInSellingCurrency(entry);
          const subtitleParts = [
            `${remainingQuantity}/${totalQuantity} ${this.t("liveSinglesAutocompleteStockLabel", "in stock")}`
          ];
          if (marketValue > 0) {
            subtitleParts.push(`${this.t("liveSinglesAutocompleteMarketLabel", "Market")} $${this.fmtCurrency(marketValue, 2)}`);
          }
          const subtitle = subtitleParts.join(" • ");
          const image = String(entry.image || "").trim();
          const searchText = normalizeLiveSinglesSearchValue([
            itemName,
            cardNumber,
            title,
            subtitle
          ].join(" "));

          return {
            title,
            value: entryId,
            subtitle,
            name: itemName,
            cardNumber,
            image,
            searchText
          } satisfies LiveSinglesAutocompleteItem;
        })
        .filter((item: LiveSinglesAutocompleteItem | null): item is LiveSinglesAutocompleteItem => item != null)
        .filter((item: LiveSinglesAutocompleteItem) => (
          queryTokens.length === 0
            ? true
            : queryTokens.every((token) => item.searchText.includes(token))
        ))
        .sort((a: LiveSinglesAutocompleteItem, b: LiveSinglesAutocompleteItem) => (
          compareLocalizedText(a.title, b.title, this?.preferredLanguage || "")
        ));
    },

    hasLiveSinglesSelection(this: LiveSinglesPanelThis): boolean {
      return Array.isArray(this.effectiveLiveSinglesIds) && this.effectiveLiveSinglesIds.length > 0;
    },

    liveSinglesSelectedCount(this: LiveSinglesPanelThis): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + this.getLiveSinglesEntryQuantity(entry);
      }, 0);
    },

    liveSinglesBasisTotal(this: LiveSinglesPanelThis): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + (this.resolveEntryBasis(entry) * this.getLiveSinglesEntryQuantity(entry));
      }, 0);
    },

    liveSinglesSuggestedBundlePrice(this: LiveSinglesPanelThis): number {
      if (!this.hasLiveSinglesSelection) return 0;
      const targetProfitPercent = Math.max(0, Number(this.targetProfitPercent) || 0);
      const targetNetRevenue = this.liveSinglesBasisTotal * (1 + (targetProfitPercent / 100));
      const calculatePrice = this.calculatePriceForUnits;
      if (typeof calculatePrice !== "function") return roundCurrency(targetNetRevenue);
      return Math.max(0, calculatePrice(1, targetNetRevenue));
    },

    liveSinglesEffectiveBundlePrice(this: LiveSinglesPanelThis): number {
      const draftedBundle = Number(this.liveSinglesBundlePrice);
      if (Number.isFinite(draftedBundle) && draftedBundle >= 0) {
        return draftedBundle;
      }
      return this.liveSinglesSuggestedBundlePrice;
    },

    liveSinglesBundleProfit(this: LiveSinglesPanelThis): number {
      if (!this.hasLiveSinglesSelection) return 0;
      const netFromGross = this.netFromGross;
      const bundlePrice = this.liveSinglesEffectiveBundlePrice;
      const netRevenue = typeof netFromGross === "function"
        ? netFromGross(bundlePrice, this.sellingShippingPerOrder, 1)
        : bundlePrice;
      return netRevenue - this.liveSinglesBasisTotal;
    },

    liveSinglesBundleProfitPercent(this: LiveSinglesPanelThis): number {
      const basisTotal = Math.max(0, Number(this.liveSinglesBasisTotal) || 0);
      const profit = Number(this.liveSinglesBundleProfit) || 0;
      if (basisTotal <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basisTotal) * 100;
    },

    liveSinglesIndividualTotalPrice(this: LiveSinglesPanelThis): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + (this.getIndividualPrice(entry) * this.getLiveSinglesEntryQuantity(entry));
      }, 0);
    },

    liveSinglesIndividualTotalProfit(this: LiveSinglesPanelThis): number {
      if (!Array.isArray(this.effectiveLiveSinglesEntries)) return 0;
      return this.effectiveLiveSinglesEntries.reduce((sum: number, entry: SinglesPurchaseEntry) => {
        return sum + this.getIndividualProfit(entry);
      }, 0);
    },

    liveSinglesIndividualTotalProfitPercent(this: LiveSinglesPanelThis): number {
      const basisTotal = Math.max(0, Number(this.liveSinglesBasisTotal) || 0);
      const profit = Number(this.liveSinglesIndividualTotalProfit) || 0;
      if (basisTotal <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basisTotal) * 100;
    },

    liveSinglesBundleAllocations(this: LiveSinglesPanelThis): Array<{
      id: number;
      share: number;
      percent: number;
    }> {
      if (!Array.isArray(this.effectiveLiveSinglesEntries) || this.effectiveLiveSinglesEntries.length === 0) return [];

      const bundlePrice = this.liveSinglesEffectiveBundlePrice;
      const basisByEntry: Array<{ id: number; basis: number }> = this.effectiveLiveSinglesEntries.map((entry: SinglesPurchaseEntry) => ({
        id: entry.id,
        basis: this.resolveEntryBasis(entry) * this.getLiveSinglesEntryQuantity(entry)
      }));
      const totalBasis = basisByEntry.reduce((sum: number, entry: { id: number; basis: number }) => sum + entry.basis, 0);
      const equalShare = basisByEntry.length > 0 ? (bundlePrice / basisByEntry.length) : 0;

      return basisByEntry.map((entry: { id: number; basis: number }) => {
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
    resolveVuetifySlotNumber,
    resolveVuetifySlotString,
    resolveVuetifySlotValue,
    t(this: LiveSinglesPanelThis, key: string, fallback = ""): string {
      const context = (this.ctx || this.$root) as Record<string, unknown> | undefined;
      const translator = context?.t as ((messageKey: string) => string) | undefined;
      if (typeof translator === "function") {
        const translated = translator(key);
        if (typeof translated === "string" && translated.trim()) {
          return translated;
        }
      }
      return fallback;
    },
    fmtCurrency(this: LiveSinglesPanelThis, value: number | null | undefined, decimals = 2): string {
      const context = (this.ctx || this.$root) as Record<string, unknown> | undefined;
      const formatCurrency = context?.formatCurrency as ((nextValue: number | null | undefined, nextDecimals?: number) => string) | undefined;
      if (typeof formatCurrency === "function") {
        return formatCurrency(value, decimals);
      }
      const formatter = this.safeFixed;
      if (typeof formatter === "function") {
        return formatter(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    },

    openLiveSinglesImagePreview(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): void {
      const image = String(entry?.image || "").trim();
      if (!image) return;

      this.liveSinglesImagePreviewSrc = image;
      this.liveSinglesImagePreviewTitle = String(entry?.item || entry?.cardNumber || "").trim();
      this.liveSinglesImagePreviewOpen = true;
    },

    closeLiveSinglesImagePreview(this: LiveSinglesPanelThis): void {
      this.liveSinglesImagePreviewOpen = false;
      this.liveSinglesImagePreviewSrc = "";
      this.liveSinglesImagePreviewTitle = "";
    },

    onLiveSinglesImagePreviewModelValue(this: LiveSinglesPanelThis, value: boolean): void {
      if (!value) {
        this.closeLiveSinglesImagePreview();
      }
    },

    getStockLabel(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): string {
      const totalQuantity = toWholeNonNegative(entry.quantity);
      const soldById = (this.singlesSoldCountByPurchaseId || {}) as Record<number, number>;
      const soldQuantity = toWholeNonNegative(soldById[entry.id]);
      const remainingQuantity = Math.max(0, totalQuantity - soldQuantity);
      return `${remainingQuantity}/${totalQuantity}`;
    },

    getLiveSinglesEntryMaxQuantity(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      const totalQuantity = toWholeNonNegative(entry.quantity);
      const soldById = (this.singlesSoldCountByPurchaseId || {}) as Record<number, number>;
      const soldQuantity = toWholeNonNegative(soldById[entry.id]);
      const remainingQuantity = Math.max(0, totalQuantity - soldQuantity);
      return Math.max(1, remainingQuantity);
    },

    getLiveSinglesEntryQuantity(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      const entryId = toPositiveInt(entry.id);
      if (!entryId) return 1;
      const maxQuantity = this.getLiveSinglesEntryMaxQuantity(entry);
      const draftedQuantity = toWholeNonNegative(this.liveSinglesQuantities?.[entryId]);
      if (draftedQuantity <= 0) return 1;
      return Math.min(maxQuantity, Math.max(1, draftedQuantity));
    },

    setLiveSinglesEntryQuantity(this: LiveSinglesPanelThis, entryId: number, nextQuantity: unknown): void {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return;
      const entry = (this.effectiveLiveSinglesEntries || [])
        .find((candidate: SinglesPurchaseEntry) => toPositiveInt(candidate.id) === parsedId);
      if (!entry) return;

      const previousQuantity = this.getLiveSinglesEntryQuantity(entry);
      const nextWholeQuantity = Math.min(
        this.getLiveSinglesEntryMaxQuantity(entry),
        Math.max(1, toWholeNonNegative(nextQuantity) || 1)
      );
      if (previousQuantity === nextWholeQuantity) return;

      this.liveSinglesQuantities = {
        ...(this.liveSinglesQuantities || {}),
        [parsedId]: nextWholeQuantity
      };
      this.liveSinglesIndividualPrices = {
        ...(this.liveSinglesIndividualPrices || {}),
        [parsedId]: this.getSuggestedIndividualPrice(entry)
      };
      this.liveSinglesBundlePrice = this.liveSinglesSuggestedBundlePrice;
    },

    adjustLiveSinglesEntryQuantity(this: LiveSinglesPanelThis, entryId: number, direction: -1 | 1): void {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return;
      const entry = (this.effectiveLiveSinglesEntries || [])
        .find((candidate: SinglesPurchaseEntry) => toPositiveInt(candidate.id) === parsedId);
      if (!entry) return;
      const currentQuantity = this.getLiveSinglesEntryQuantity(entry);
      this.setLiveSinglesEntryQuantity(parsedId, currentQuantity + direction);
    },

    getEntryCostInSellingCurrency(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
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

    getEntryMarketValueInSellingCurrency(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      return getSinglesEntryUnitMarketValueInSellingCurrency(
        entry,
        this.currency === "USD" ? "USD" : "CAD",
        this.sellingCurrency,
        this.exchangeRate,
        DEFAULT_VALUES.EXCHANGE_RATE
      );
    },

    resolveEntryBasis(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      const marketValue = this.getEntryMarketValueInSellingCurrency(entry);
      if (marketValue > 0) return marketValue;
      return this.getEntryCostInSellingCurrency(entry);
    },

    getSuggestedIndividualPrice(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      const basis = this.resolveEntryBasis(entry);
      const quantity = this.getLiveSinglesEntryQuantity(entry);
      const targetProfitPercent = Math.max(0, Number(this.targetProfitPercent) || 0);
      const targetNetRevenue = (basis * quantity) * (1 + (targetProfitPercent / 100));
      const calculatePrice = this.calculatePriceForUnits;
      if (typeof calculatePrice !== "function") return roundCurrency(quantity > 0 ? (targetNetRevenue / quantity) : targetNetRevenue);
      return Math.max(0, calculatePrice(quantity, targetNetRevenue));
    },

    syncLiveSinglesPricingState(this: LiveSinglesPanelThis): void {
      const selectedIds = Array.isArray(this.effectiveLiveSinglesIds)
        ? this.effectiveLiveSinglesIds
        : [];
      const selectionKey = selectedIds.join(",");
      const selectedSet = new Set(
        selectedIds
          .map((value: unknown) => toPositiveInt(value))
          .filter((value: number | null): value is number => value != null)
      );
      const existingQuantities = this.liveSinglesQuantities as Record<number, number>;
      const nextQuantities: Record<number, number> = {};
      for (const entry of (this.effectiveLiveSinglesEntries || []) as SinglesPurchaseEntry[]) {
        const entryId = toPositiveInt(entry.id);
        if (!entryId || !selectedSet.has(entryId)) continue;
        const maxQuantity = this.getLiveSinglesEntryMaxQuantity(entry);
        const parsedQuantity = toWholeNonNegative(existingQuantities?.[entryId]);
        nextQuantities[entryId] = parsedQuantity > 0
          ? Math.min(maxQuantity, Math.max(1, parsedQuantity))
          : 1;
      }
      this.liveSinglesQuantities = nextQuantities;

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
        this.liveSinglesQuantities = {};
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

    getIndividualPrice(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
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

    getIndividualProfit(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      const price = this.getIndividualPrice(entry);
      const quantity = this.getLiveSinglesEntryQuantity(entry);
      const netFromGross = this.netFromGross;
      const netRevenue = typeof netFromGross === "function"
        ? netFromGross(price * quantity, this.sellingShippingPerOrder, quantity)
        : (price * quantity);
      return netRevenue - (this.resolveEntryBasis(entry) * quantity);
    },

    getIndividualProfitPercent(this: LiveSinglesPanelThis, entry: SinglesPurchaseEntry): number {
      const basis = Math.max(0, Number(this.resolveEntryBasis(entry)) || 0);
      const profit = Number(this.getIndividualProfit(entry)) || 0;
      if (basis <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basis) * 100;
    },

    getBundleAllocationForEntry(this: LiveSinglesPanelThis, entryId: number): { id: number; share: number; percent: number } | null {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return null;
      return (this.liveSinglesBundleAllocations || []).find((allocation: { id: number }) => allocation.id === parsedId) || null;
    },

    onIndividualPriceInput(this: LiveSinglesPanelThis, entryId: number, value: unknown): void {
      const parsedId = toPositiveInt(entryId);
      if (!parsedId) return;
      const parsedPrice = Number(value);
      this.liveSinglesIndividualPrices = {
        ...this.liveSinglesIndividualPrices,
        [parsedId]: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? roundCurrency(parsedPrice) : 0
      };
    },

    adjustIndividualPrice(this: LiveSinglesPanelThis, entryId: number, direction: -1 | 1): void {
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

    adjustBundlePrice(this: LiveSinglesPanelThis, direction: -1 | 1): void {
      const step = 1;
      const current = toNonNegativeNumber(this.liveSinglesEffectiveBundlePrice);
      const next = Math.max(0, roundCurrency(current + (direction * step)));
      this.liveSinglesBundlePrice = next;
    },

    onLiveSinglesPickerSelection(this: LiveSinglesPanelThis, value: unknown): void {
      const selectedId = toPositiveInt(value);
      if (!selectedId) {
        this.liveSinglesSelectedId = null;
        this.liveSinglesSearchText = "";
        return;
      }
      this.addLiveSinglesSelection(selectedId, "manual");
      this.liveSinglesSelectedId = null;
      this.liveSinglesSearchText = "";
    },

    addLiveSinglesFromPicker(this: LiveSinglesPanelThis): void {
      this.onLiveSinglesPickerSelection(this.liveSinglesSelectedId);
    },

    removeLiveSinglesEntry(this: LiveSinglesPanelThis, entryId: number): void {
      this.removeLiveSinglesSelection(entryId, "manual");
      this.removeLiveSinglesSelection(entryId, "external");
    },

    clearLiveSinglesEntries(this: LiveSinglesPanelThis): void {
      this.clearLiveSinglesSelection();
      this.liveSinglesQuantities = {};
      this.liveSinglesIndividualPrices = {};
      this.liveSinglesBundlePrice = null;
      this.liveSinglesBundleSelectionKey = "";
    },

    convertLiveSinglesToSale(this: LiveSinglesPanelThis): void {
      if (this.currentLotType !== "singles") return;
      const openModal = this.openConvertLiveSinglesSaleModal;
      if (typeof openModal !== "function") return;

      const entries = Array.isArray(this.effectiveLiveSinglesEntries)
        ? this.effectiveLiveSinglesEntries as SinglesPurchaseEntry[]
        : [];
      if (entries.length === 0) return;

      const lines = entries.reduce<SinglesSaleLine[]>((result, entry) => {
          const entryId = toPositiveInt(entry.id);
          if (!entryId) return result;
          const quantity = Number(this.getLiveSinglesEntryQuantity(entry));
          const totalPrice = this.liveSinglesPricingMode === "bundle"
            ? (this.getBundleAllocationForEntry(entryId)?.share || 0)
            : (this.getIndividualPrice(entry) * quantity);
          result.push({
            singlesPurchaseEntryId: entryId,
            quantity,
            price: roundCurrency(totalPrice)
          });
          return result;
        }, []);
      if (lines.length === 0) return;

      openModal.call(this, lines, {
        buyerShipping: this.sellingShippingPerOrder
      });
    },

    panelApplySuggestedLiveSinglesPricing(this: LiveSinglesPanelThis): void {
      const entries = Array.isArray(this.effectiveLiveSinglesEntries)
        ? this.effectiveLiveSinglesEntries as SinglesPurchaseEntry[]
        : [];

      if (entries.length === 0) {
        this.liveSinglesQuantities = {};
        this.liveSinglesIndividualPrices = {};
        this.liveSinglesBundlePrice = null;
        this.liveSinglesBundleSelectionKey = "";
        return;
      }

      const nextPrices: Record<number, number> = {};
      const nextQuantities: Record<number, number> = {};
      for (const entry of entries) {
        const entryId = toPositiveInt(entry.id);
        if (!entryId) continue;
        nextQuantities[entryId] = this.getLiveSinglesEntryQuantity(entry);
        nextPrices[entryId] = this.getSuggestedIndividualPrice(entry);
      }

      this.liveSinglesQuantities = nextQuantities;
      this.liveSinglesIndividualPrices = nextPrices;
      this.liveSinglesBundleSelectionKey = entries
        .map((entry) => toPositiveInt(entry.id))
        .filter((entryId: number | null): entryId is number => entryId != null)
        .join(",");
      this.liveSinglesBundlePrice = this.liveSinglesSuggestedBundlePrice;
    },

    panelResetLiveSinglesPricing(this: LiveSinglesPanelThis): void {
      this.panelApplySuggestedLiveSinglesPricing();
    },

    loadLiveSinglesModeFromStorage(this: LiveSinglesPanelThis): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.LIVE_SINGLES_MODE);
        if (!isLiveSinglesPricingMode(raw)) return;
        this.liveSinglesPricingMode = raw;
      } catch {
        // Ignore storage read errors.
      }
    },

    persistLiveSinglesMode(this: LiveSinglesPanelThis): void {
      try {
        localStorage.setItem(STORAGE_KEYS.LIVE_SINGLES_MODE, this.liveSinglesPricingMode);
      } catch {
        // Ignore storage write errors.
      }
    }
  },
  watch: {
    effectiveLiveSinglesIds: {
      handler(this: LiveSinglesPanelThis): void {
        this.syncLiveSinglesPricingState();
      },
      immediate: true
    },
    liveSinglesPricingMode(this: LiveSinglesPanelThis): void {
      this.persistLiveSinglesMode();
    }
  },
  mounted(this: LiveSinglesPanelThis) {
    this.loadLiveSinglesModeFromStorage();
  },
  setup(props: { ctx?: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx ?? {}) as Record<string, unknown>;
    return createWindowContextBridge(source);
  }
};
