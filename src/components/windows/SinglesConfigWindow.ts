import template from "./SinglesConfigWindow.html?raw";
import "./ConfigWindow.css";
import "./SinglesConfigWindow.css";
import { inject, type PropType } from "vue";
import type { SinglesCatalogSource, SinglesPurchaseEntry } from "../../types/app.ts";
import { STORAGE_KEYS } from "../../app-core/storageKeys.ts";
import { normalizeSinglesCatalogSource } from "../../app-core/shared/singles-catalog-source.ts";
import { createWindowContextBridge } from "./contextBridge.ts";
import { singlesImportComputed, singlesImportMethods } from "./singles/useSinglesImport.ts";
import { SinglesCsvImportDialog } from "./singles/SinglesCsvImportDialog.ts";
import { AdminSyncImportCard } from "./AdminSyncImportCard.ts";

const SINGLES_INFO_NOTICE_DISMISSED_KEY = "whatfees_singles_info_notice_dismissed_v1";
type SinglesDesktopSortKey = "item" | "cardNumber" | "cost" | "quantity" | "marketValue";
type SinglesMobileSortKey = "recent" | "item" | "marketValue";
const DESKTOP_VIRTUAL_THRESHOLD = 150;
const DESKTOP_VIRTUAL_ROW_HEIGHT = 52;
const DESKTOP_VIRTUAL_VIEWPORT_HEIGHT = 560;
const DESKTOP_VIRTUAL_BUFFER_ROWS = 6;
const MOBILE_RENDER_INITIAL_COUNT = 30;
const MOBILE_RENDER_BATCH_COUNT = 30;
const SINGLES_CARD_SEARCH_DEBOUNCE_MS = 400;
const SINGLES_CARD_SEARCH_LIMIT = 25;

type CardSearchApiItem = {
  name?: string;
  cardNo?: string;
  image?: string;
  rarity?: string;
  marketPrice?: number | null;
};

type SinglesCardSuggestion = {
  title: string;
  value: string;
  name: string;
  cardNo: string;
  image: string;
  rarity: string;
  marketPrice: number | null;
};

function createSinglesCardSuggestionValue(name: unknown, cardNo: unknown, rarity: unknown): string {
  const safeName = String(name || "").trim();
  const safeCardNo = String(cardNo || "").trim();
  const safeRarity = String(rarity || "").trim();
  return `${safeName}|${safeCardNo}|${safeRarity}`;
}

function createSinglesCardImageCacheKey(
  catalogSource: unknown,
  item: unknown,
  cardNo: unknown
): string {
  const source = normalizeSinglesCatalogSource(catalogSource as SinglesCatalogSource);
  const safeItem = String(item || "").trim().toLocaleLowerCase();
  const safeCardNo = String(cardNo || "").trim().toLocaleLowerCase();
  if (!safeItem) return "";
  return `${source}|${safeItem}|${safeCardNo}`;
}

function mapCardSearchItemToSuggestion(item: CardSearchApiItem, index: number): SinglesCardSuggestion | null {
  const name = String(item.name || "").trim();
  if (!name) return null;
  const cardNo = String(item.cardNo || "").trim();
  const image = String(item.image || "").trim();
  const rarity = String(item.rarity || "").trim();
  const marketPriceRaw = Number(item.marketPrice);
  const marketPrice = Number.isFinite(marketPriceRaw) ? marketPriceRaw : null;
  return {
    title: cardNo ? `${name} #${cardNo}` : name,
    value: createSinglesCardSuggestionValue(name, cardNo, rarity || index),
    name,
    cardNo,
    image,
    rarity,
    marketPrice
  } satisfies SinglesCardSuggestion;
}

function normalizeSinglesSearchTokens(query: unknown): string[] {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((token) => token.length > 0);
}

type CardSearchToken = {
  value: string;
  rarityOnly: boolean;
};

function normalizeCardSearchComparable(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[★☆✩✭✮✯]/g, "*");
}

function tokenizeCardSearchQuery(query: unknown): CardSearchToken[] {
  return String(query || "")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const normalized = token.replace(/[★☆✩✭✮✯]/g, "*");
      const rarityOnly = normalized.includes("*");
      const value = normalized.trim();
      return {
        value,
        rarityOnly
      };
    })
    .filter((token) => token.value.replace(/\*/g, "").length > 0);
}

function matchesCardSuggestionQuery(item: SinglesCardSuggestion, query: unknown): boolean {
  const tokens = tokenizeCardSearchQuery(query);
  if (tokens.length === 0) return true;

  const name = normalizeCardSearchComparable(item.name);
  const cardNo = normalizeCardSearchComparable(item.cardNo);
  const rarity = normalizeCardSearchComparable(item.rarity);

  return tokens.every((token) => {
    if (token.rarityOnly) {
      return rarity.startsWith(token.value);
    }
    return name.includes(token.value) || cardNo.includes(token.value) || rarity.includes(token.value);
  });
}

function resolveCardSearchBackendQuery(query: unknown): string {
  const rawQuery = String(query || "").trim();
  const tokens = tokenizeCardSearchQuery(rawQuery);
  if (tokens.length === 0) return "";
  return rawQuery;
}

function createNextSinglesEntryId(entries: SinglesPurchaseEntry[]): number {
  const highestId = entries.reduce((maxId, entry) => {
    const candidateId = Number(entry.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) return maxId;
    return Math.max(maxId, Math.floor(candidateId));
  }, 0);
  return Math.max(Date.now(), highestId + 1);
}

function toConditionAbbreviation(value: unknown): string {
  const normalized = String(value || "").trim().toLocaleLowerCase();
  if (!normalized) return "—";

  const map: Record<string, string> = {
    "near mint": "NM",
    near: "NM",
    nm: "NM",
    mint: "M",
    m: "M",
    new: "N",
    n: "N",
    good: "G",
    g: "G",
    "light played": "LP",
    lp: "LP",
    "moderately played": "MP",
    mp: "MP",
    "heavily played": "HP",
    hp: "HP",
    damaged: "DMG",
    dmg: "DMG",
    poor: "P"
  };

  if (map[normalized]) return map[normalized];
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (!compact) return "—";
  return compact.slice(0, Math.min(3, compact.length)).toUpperCase();
}

function toLanguageAbbreviation(value: unknown): string {
  const normalized = String(value || "").trim().toLocaleLowerCase();
  if (!normalized) return "—";

  const map: Record<string, string> = {
    english: "En",
    en: "En",
    french: "Fr",
    fr: "Fr",
    spanish: "Es",
    es: "Es",
    german: "De",
    de: "De",
    italian: "It",
    it: "It",
    portuguese: "Pt",
    pt: "Pt",
    japanese: "Jp",
    jp: "Jp",
    korean: "Kr",
    kr: "Kr",
    chinese: "Zh",
    zh: "Zh",
    russian: "Ru",
    ru: "Ru"
  };

  if (map[normalized]) return map[normalized];
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (!compact) return "—";
  return `${compact.slice(0, 1).toUpperCase()}${compact.slice(1, 2).toLowerCase()}`;
}

type SinglesDesktopSortKeyWithMeta =
  | SinglesDesktopSortKey
  | "condition"
  | "language";

export const SinglesConfigWindow: any = {
  name: "SinglesConfigWindow",
  components: {
    SinglesCsvImportDialog,
    AdminSyncImportCard
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      showSinglesInfoNotice: true,
      showSinglesRowEditor: false,
      showCatalogSourceSheet: false,
      showFullySoldSingles: false,
      singlesSearchQuery: "",
      showSinglesImagePreview: false,
      singlesImagePreviewSrc: "",
      singlesImagePreviewTitle: "",
      isDesktopSelectMode: false,
      selectedDesktopRowIds: [] as number[],
      desktopSortBy: null as SinglesDesktopSortKeyWithMeta | null,
      desktopSortDesc: false,
      desktopRowsScrollTop: 0,
      mobileRenderCount: MOBILE_RENDER_INITIAL_COUNT,
      mobileSortBy: "item" as SinglesMobileSortKey,
      editingSinglesRowId: null as number | null,
      editingSinglesRow: {
        item: "",
        cardNumber: "",
        image: "",
        condition: "",
        language: "",
        cost: 0,
        currency: "CAD" as "CAD" | "USD",
        quantity: 1,
        marketValue: 0
      },
      singlesItemSearchText: "",
      singlesItemMenuOpen: false,
      singlesEditorPreviewLoading: false,
      singlesItemSearchLoading: false,
      suppressNextSinglesItemSearchUpdate: false,
      singlesCardImageCache: {} as Record<string, string>,
      singlesItemSuggestions: [] as SinglesCardSuggestion[],
      singlesItemSearchTimerId: null as ReturnType<typeof setTimeout> | null,
      singlesItemSearchAbortController: null as AbortController | null,
      singlesItemSearchRequestSeq: 0,
      singlesEditorPreviewRequestSeq: 0,
      singlesConditionOptions: [
        "Near Mint",
        "Mint",
        "New",
        "Good",
        "Light Played",
        "Moderately Played",
        "Heavily Played",
        "Damaged"
      ],
      singlesLanguageOptions: [
        "English",
        "French",
        "Japanese",
        "Chinese",
        "Spanish"
      ]
    };
  },
  computed: {
    ...singlesImportComputed,
    currentSinglesCatalogSource: {
      get(this: any): SinglesCatalogSource {
        if (!this.currentLotId) return "none";
        const lot = (this.lots as Array<Record<string, unknown>>).find((candidate) => candidate.id === this.currentLotId);
        if (!lot || lot.lotType !== "singles") return "none";
        return normalizeSinglesCatalogSource(
          lot.singlesCatalogSource,
          normalizeSinglesCatalogSource(this.currentLotCatalogSource)
        );
      },
      set(this: any, nextValue: SinglesCatalogSource): void {
        this.setCurrentSinglesCatalogSource(nextValue);
      }
    },

    showCatalogSuggestions(this: any): boolean {
      return this.currentSinglesCatalogSource !== "none";
    },

    currentSinglesCatalogSourceLabel(this: any): string {
      const source = normalizeSinglesCatalogSource(this.currentSinglesCatalogSource);
      if (source === "pokemon") return "Pokemon";
      if (source === "none") return "Custom";
      return "Union Arena";
    },

    visibleSinglesPurchases(this: any): SinglesPurchaseEntry[] {
      const rows = Array.isArray(this.singlesPurchases)
        ? this.singlesPurchases as SinglesPurchaseEntry[]
        : [];
      const soldFilteredRows = this.showFullySoldSingles
        ? rows
        : rows.filter((entry) => !this.isSinglesEntryFullySold(entry));

      const tokens = normalizeSinglesSearchTokens(this.singlesSearchQuery);
      if (tokens.length === 0) return soldFilteredRows;

      return soldFilteredRows.filter((entry) => {
        const itemText = String(entry.item || "").toLocaleLowerCase();
        const cardNumberText = String(entry.cardNumber || "").toLocaleLowerCase();
        const haystack = `${cardNumberText} ${itemText}`;
        return tokens.every((token) => haystack.includes(token));
      });
    },

    hasSinglesSearchQuery(this: any): boolean {
      return normalizeSinglesSearchTokens(this.singlesSearchQuery).length > 0;
    },

    mobileRenderedSinglesPurchases(this: any): SinglesPurchaseEntry[] {
      const getSortedRows = this.mobileSortedSinglesPurchases as (() => SinglesPurchaseEntry[]) | SinglesPurchaseEntry[] | undefined;
      const resolvedRows = typeof getSortedRows === "function"
        ? getSortedRows.call(this)
        : (getSortedRows ?? this.visibleSinglesPurchases);
      const rows = Array.isArray(resolvedRows)
        ? resolvedRows as SinglesPurchaseEntry[]
        : [];
      const cappedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return rows.slice(0, cappedCount);
    },

    mobileSortedSinglesPurchases(this: any): SinglesPurchaseEntry[] {
      const rows = Array.isArray(this.visibleSinglesPurchases)
        ? [...this.visibleSinglesPurchases as SinglesPurchaseEntry[]]
        : [];
      const sortBy = String(this.mobileSortBy || "recent") as SinglesMobileSortKey;
      if (sortBy === "recent") return rows;

      if (sortBy === "item") {
        return rows.sort((a, b) => String(a.item || "").localeCompare(String(b.item || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        }));
      }

      return rows.sort((a, b) => {
        const totalQuantityA = Math.max(0, Math.floor(Number(a.quantity) || 0));
        const totalQuantityB = Math.max(0, Math.floor(Number(b.quantity) || 0));
        const valueA = Math.max(0, (Number(a.marketValue) || 0) * totalQuantityA);
        const valueB = Math.max(0, (Number(b.marketValue) || 0) * totalQuantityB);
        if (valueA !== valueB) return valueB - valueA;
        return String(a.item || "").localeCompare(String(b.item || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        });
      });
    },

    mobileSortLabel(this: any): string {
      const sortBy = String(this.mobileSortBy || "recent");
      if (sortBy === "item") return "Name";
      if (sortBy === "marketValue") return "Market";
      return "Recent";
    },

    singlesEditorCatalogItems(this: any): SinglesCardSuggestion[] {
      const suggestions = Array.isArray(this.singlesItemSuggestions)
        ? [...this.singlesItemSuggestions as SinglesCardSuggestion[]]
        : [];
      const item = String(this.editingSinglesRow?.item || "").trim();
      if (!item) return suggestions;

      const cardNo = String(this.editingSinglesRow?.cardNumber || "").trim();
      const image = String(this.editingSinglesRow?.image || "").trim();
      const marketPrice = Number(this.editingSinglesRow?.marketValue);
      const existing = suggestions.find((suggestion) => (
        String(suggestion.name || "").trim() === item
        && String(suggestion.cardNo || "").trim() === cardNo
      ));
      if (existing) return suggestions;

      return [
        {
          title: this.formatSinglesEditorItemLabel(item, cardNo),
          value: createSinglesCardSuggestionValue(item, cardNo, ""),
          name: item,
          cardNo,
          image,
          rarity: "",
          marketPrice: Number.isFinite(marketPrice) ? marketPrice : null
        },
        ...suggestions
      ];
    },

    currentSinglesEditorSelectionValue(this: any): string | null {
      const activeSearch = String(this.singlesItemSearchText || "").trim();
      if (activeSearch) return null;
      const item = String(this.editingSinglesRow?.item || "").trim();
      if (!item) return null;
      const cardNo = String(this.editingSinglesRow?.cardNumber || "").trim();
      const rarity = Array.isArray(this.singlesItemSuggestions)
        ? String(
          (this.singlesItemSuggestions as SinglesCardSuggestion[]).find((suggestion) => (
            String(suggestion.name || "").trim() === item
            && String(suggestion.cardNo || "").trim() === cardNo
          ))?.rarity || ""
        ).trim()
        : "";
      return createSinglesCardSuggestionValue(item, cardNo, rarity);
    },

    editingSinglesPreviewImage(this: any): string {
      const item = String(this.editingSinglesRow?.item || "").trim();
      if (!item) return "";
      const directImage = String(this.editingSinglesRow?.image || "").trim();
      if (directImage) return directImage;
      const cardNo = String(this.editingSinglesRow?.cardNumber || "").trim();
      const suggestions = Array.isArray(this.singlesItemSuggestions)
        ? this.singlesItemSuggestions as SinglesCardSuggestion[]
        : [];
      const itemLower = item.toLocaleLowerCase();
      const cardNoLower = cardNo.toLocaleLowerCase();
      const matchingSuggestion = suggestions.find((suggestion) => {
        if (!suggestion.image) return false;
        if (String(suggestion.name || "").trim().toLocaleLowerCase() !== itemLower) return false;
        if (!cardNoLower) return true;
        return String(suggestion.cardNo || "").trim().toLocaleLowerCase() === cardNoLower;
      });
      if (matchingSuggestion?.image) return matchingSuggestion.image;

      const cache = this.singlesCardImageCache as Record<string, string>;
      const exactKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, item, cardNo);
      if (exactKey && typeof cache?.[exactKey] === "string" && cache[exactKey]) {
        return cache[exactKey];
      }

      const nameKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, item, "");
      if (nameKey && typeof cache?.[nameKey] === "string" && cache[nameKey]) {
        return cache[nameKey];
      }

      return "";
    },

    hasMoreMobileSinglesRows(this: any): boolean {
      const getSortedRows = this.mobileSortedSinglesPurchases as (() => SinglesPurchaseEntry[]) | SinglesPurchaseEntry[] | undefined;
      const resolvedRows = typeof getSortedRows === "function"
        ? getSortedRows.call(this)
        : (getSortedRows ?? this.visibleSinglesPurchases);
      const totalRows = Array.isArray(resolvedRows)
        ? resolvedRows.length
        : 0;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return totalRows > renderedCount;
    },

    remainingMobileSinglesRows(this: any): number {
      const getSortedRows = this.mobileSortedSinglesPurchases as (() => SinglesPurchaseEntry[]) | SinglesPurchaseEntry[] | undefined;
      const resolvedRows = typeof getSortedRows === "function"
        ? getSortedRows.call(this)
        : (getSortedRows ?? this.visibleSinglesPurchases);
      const totalRows = Array.isArray(resolvedRows)
        ? resolvedRows.length
        : 0;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return Math.max(0, totalRows - renderedCount);
    },

    nextMobileSinglesBatchCount(this: any): number {
      const getSortedRows = this.mobileSortedSinglesPurchases as (() => SinglesPurchaseEntry[]) | SinglesPurchaseEntry[] | undefined;
      const resolvedRows = typeof getSortedRows === "function"
        ? getSortedRows.call(this)
        : (getSortedRows ?? this.visibleSinglesPurchases);
      const totalRows = Array.isArray(resolvedRows)
        ? resolvedRows.length
        : 0;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      const remainingRows = Math.max(0, totalRows - renderedCount);
      return Math.min(MOBILE_RENDER_BATCH_COUNT, remainingRows);
    },

    desktopSortedSinglesPurchases(this: any): SinglesPurchaseEntry[] {
      const rows = Array.isArray(this.visibleSinglesPurchases)
        ? [...this.visibleSinglesPurchases as SinglesPurchaseEntry[]]
        : [];

      if (!this.desktopSortBy) return rows;

      const sortBy = this.desktopSortBy;
      const direction = this.desktopSortDesc ? -1 : 1;
      const withIndex = rows.map((entry, index) => ({ entry, index }));
      const getTotalQuantity = (entry: SinglesPurchaseEntry): number => {
        const totalQuantity = Number(entry.quantity);
        if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) return 0;
        return Math.floor(totalQuantity);
      };

      withIndex.sort((a, b) => {
        const entryA = a.entry;
        const entryB = b.entry;

        if (sortBy === "item" || sortBy === "cardNumber" || sortBy === "condition" || sortBy === "language") {
          const valueA = String(
            sortBy === "item"
              ? entryA.item
              : sortBy === "cardNumber"
                ? entryA.cardNumber || ""
                : sortBy === "condition"
                  ? entryA.condition || ""
                  : entryA.language || ""
          ).trim();
          const valueB = String(
            sortBy === "item"
              ? entryB.item
              : sortBy === "cardNumber"
                ? entryB.cardNumber || ""
                : sortBy === "condition"
                  ? entryB.condition || ""
                  : entryB.language || ""
          ).trim();
          const compare = valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: "base" });
          if (compare !== 0) return compare * direction;
          return a.index - b.index;
        }

        const valueA = sortBy === "cost"
          ? Math.max(0, (Number(entryA.cost) || 0) * getTotalQuantity(entryA))
          : sortBy === "quantity"
            ? getTotalQuantity(entryA)
            : sortBy === "marketValue"
              ? Math.max(0, (Number(entryA.marketValue) || 0) * getTotalQuantity(entryA))
              : 0;
        const valueB = sortBy === "cost"
          ? Math.max(0, (Number(entryB.cost) || 0) * getTotalQuantity(entryB))
          : sortBy === "quantity"
            ? getTotalQuantity(entryB)
            : sortBy === "marketValue"
              ? Math.max(0, (Number(entryB.marketValue) || 0) * getTotalQuantity(entryB))
              : 0;

        if (valueA !== valueB) return (valueA - valueB) * direction;
        return a.index - b.index;
      });

      return withIndex.map((row) => row.entry);
    },

    useDesktopVirtualization(this: any): boolean {
      return (this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[]).length >= DESKTOP_VIRTUAL_THRESHOLD;
    },

    desktopVirtualStartIndex(this: any): number {
      if (!this.useDesktopVirtualization) return 0;
      const firstVisibleIndex = Math.floor(Math.max(0, this.desktopRowsScrollTop) / DESKTOP_VIRTUAL_ROW_HEIGHT);
      return Math.max(0, firstVisibleIndex - DESKTOP_VIRTUAL_BUFFER_ROWS);
    },

    desktopVirtualEndIndex(this: any): number {
      const totalRows = (this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[]).length;
      if (!this.useDesktopVirtualization) return totalRows;
      const visibleRows = Math.ceil(DESKTOP_VIRTUAL_VIEWPORT_HEIGHT / DESKTOP_VIRTUAL_ROW_HEIGHT);
      return Math.min(
        totalRows,
        this.desktopVirtualStartIndex + visibleRows + (DESKTOP_VIRTUAL_BUFFER_ROWS * 2)
      );
    },

    desktopRenderedRows(this: any): SinglesPurchaseEntry[] {
      const rows = this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[];
      if (!this.useDesktopVirtualization) return rows;
      return rows.slice(this.desktopVirtualStartIndex, this.desktopVirtualEndIndex);
    },

    desktopTopSpacerPx(this: any): number {
      if (!this.useDesktopVirtualization) return 0;
      return this.desktopVirtualStartIndex * DESKTOP_VIRTUAL_ROW_HEIGHT;
    },

    desktopBottomSpacerPx(this: any): number {
      if (!this.useDesktopVirtualization) return 0;
      const totalRows = (this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[]).length;
      return Math.max(0, (totalRows - this.desktopVirtualEndIndex) * DESKTOP_VIRTUAL_ROW_HEIGHT);
    }
  },
  methods: {
    ...singlesImportMethods,
    fmtCurrency(this: any, value: number | null | undefined, decimals = 2): string {
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    },

    getSinglesSoldQuantity(this: any, entryId: number): number {
      const soldById = this.singlesSoldCountByPurchaseId as Record<number, number> | undefined;
      const soldQuantity = Number(soldById?.[entryId] ?? 0);
      if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) return 0;
      return Math.floor(soldQuantity);
    },

    getSinglesEntryRemainingQuantity(this: any, entry: SinglesPurchaseEntry): number {
      const totalQuantity = this.getSinglesEntryTotalQuantity(entry);
      const soldQuantity = this.getSinglesSoldQuantity(entry.id);
      return Math.max(0, totalQuantity - soldQuantity);
    },

    getSinglesEntryPreviewImage(this: any, entry: SinglesPurchaseEntry): string {
      const directImage = String(entry.image || "").trim();
      if (directImage) return directImage;
      const exactKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, entry.item, entry.cardNumber);
      const nameKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, entry.item, "");
      const cache = this.singlesCardImageCache as Record<string, string>;
      if (exactKey && typeof cache?.[exactKey] === "string" && cache[exactKey]) {
        return cache[exactKey];
      }
      if (nameKey && typeof cache?.[nameKey] === "string" && cache[nameKey]) {
        return cache[nameKey];
      }
      return "";
    },

    openSinglesImagePreview(this: any, image: unknown, title?: unknown): void {
      const src = String(image || "").trim();
      if (!src) return;
      this.singlesImagePreviewSrc = src;
      this.singlesImagePreviewTitle = String(title || "").trim();
      this.showSinglesImagePreview = true;
    },

    closeSinglesImagePreview(this: any): void {
      this.showSinglesImagePreview = false;
      this.singlesImagePreviewSrc = "";
      this.singlesImagePreviewTitle = "";
    },

    getSinglesEntryTotalQuantity(this: any, entry: SinglesPurchaseEntry): number {
      const totalQuantity = Number(entry.quantity);
      if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) return 0;
      return Math.floor(totalQuantity);
    },

    getSinglesEntryStockLabel(this: any, entry: SinglesPurchaseEntry): string {
      const remainingQuantity = this.getSinglesEntryRemainingQuantity(entry);
      const totalQuantity = this.getSinglesEntryTotalQuantity(entry);
      return `${remainingQuantity}/${totalQuantity}`;
    },

    isSinglesEntryFullySold(this: any, entry: SinglesPurchaseEntry): boolean {
      const remainingQuantity = this.getSinglesEntryRemainingQuantity(entry);
      const totalQuantity = this.getSinglesEntryTotalQuantity(entry);
      return totalQuantity > 0 && remainingQuantity === 0;
    },

    getEditingSinglesQuantity(this: any): number {
      const quantity = Number(this.editingSinglesRow?.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) return 1;
      return Math.floor(quantity);
    },

    formatSinglesEditorItemLabel(this: any, item: unknown, cardNumber: unknown): string {
      const safeItem = String(item || "").trim();
      const safeCardNumber = String(cardNumber || "").trim();
      if (!safeItem) return "";
      if (!this.showCatalogSuggestions || !safeCardNumber) return safeItem;
      return `${safeItem} #${safeCardNumber}`;
    },

    setEditingSinglesQuantity(this: any, nextQuantity: unknown): void {
      const parsedQuantity = Number(nextQuantity);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
        this.editingSinglesRow.quantity = 1;
        return;
      }
      this.editingSinglesRow.quantity = Math.floor(parsedQuantity);
    },

    increaseEditingSinglesQuantity(this: any): void {
      this.setEditingSinglesQuantity(this.getEditingSinglesQuantity() + 1);
    },

    decreaseEditingSinglesQuantity(this: any): void {
      this.setEditingSinglesQuantity(this.getEditingSinglesQuantity() - 1);
    },

    resetSinglesRowDraft(
      this: any,
      options?: {
        currency?: "CAD" | "USD";
        condition?: string;
        language?: string;
      }
    ): void {
      const nextCurrency = options?.currency === "USD" || options?.currency === "CAD"
        ? options.currency
        : (this.currency === "USD" ? "USD" : "CAD");
      this.editingSinglesRow = {
        item: "",
        cardNumber: "",
        image: "",
        condition: String(options?.condition || ""),
        language: String(options?.language || ""),
        cost: 0,
        currency: nextCurrency,
        quantity: 1,
        marketValue: 0
      };
      this.singlesItemSearchText = "";
      this.singlesItemMenuOpen = false;
      this.singlesEditorPreviewLoading = false;
      this.singlesItemSuggestions = [];
      this.singlesItemSearchLoading = false;
      this.cancelSinglesItemSearch();
    },

    resolveCardsApiBaseUrl(this: any): string {
      const configuredBase = String((import.meta.env.VITE_API_BASE_URL as string | undefined) || "").trim();
      if (configuredBase) return configuredBase.replace(/\/+$/, "");
      const storage = (globalThis as { localStorage?: { getItem?: (key: string) => string | null } }).localStorage;
      const cachedBase = String(storage?.getItem?.(STORAGE_KEYS.API_BASE_URL) || "").trim();
      if (cachedBase) return cachedBase.replace(/\/+$/, "");
      return "";
    },

    cancelSinglesItemSearch(this: any): void {
      if (this.singlesItemSearchTimerId) {
        clearTimeout(this.singlesItemSearchTimerId);
        this.singlesItemSearchTimerId = null;
      }
      if (this.singlesItemSearchAbortController) {
        this.singlesItemSearchAbortController.abort();
        this.singlesItemSearchAbortController = null;
      }
    },

    cacheSinglesSuggestionImages(this: any, suggestions: SinglesCardSuggestion[]): void {
      if (!Array.isArray(suggestions) || suggestions.length === 0) return;
      const nextCache = {
        ...(this.singlesCardImageCache as Record<string, string> | undefined)
      };

      for (const suggestion of suggestions) {
        const image = String(suggestion.image || "").trim();
        if (!image) continue;
        const exactKey = createSinglesCardImageCacheKey(
          this.currentSinglesCatalogSource,
          suggestion.name,
          suggestion.cardNo
        );
        if (exactKey) {
          nextCache[exactKey] = image;
        }

        const nameKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, suggestion.name, "");
        if (nameKey && !nextCache[nameKey]) {
          nextCache[nameKey] = image;
        }
      }

      this.singlesCardImageCache = nextCache;
    },

    async requestSinglesCardSuggestions(
      this: any,
      query: string,
      signal?: AbortSignal
    ): Promise<SinglesCardSuggestion[]> {
      const catalogSource = normalizeSinglesCatalogSource(this.currentSinglesCatalogSource);
      if (catalogSource === "none") return [];

      const apiBase = this.resolveCardsApiBaseUrl();
      if (!apiBase) return [];
      const backendQuery = resolveCardSearchBackendQuery(query);
      if (backendQuery.trim().length < 2) return [];

      const url = new URL(`${apiBase}/cards/search`);
      url.searchParams.set("game", catalogSource);
      url.searchParams.set("q", backendQuery);
      url.searchParams.set("limit", String(SINGLES_CARD_SEARCH_LIMIT));

      const response = await fetch(url.toString(), {
        method: "GET",
        signal
      });
      if (!response.ok) throw new Error(`Cards search failed (${response.status})`);

      const payload = await response.json() as { items?: CardSearchApiItem[] };
      const items = Array.isArray(payload.items) ? payload.items : [];
      const suggestions = items
        .map((item, index) => mapCardSearchItemToSuggestion(item, index))
        .filter((item): item is SinglesCardSuggestion => item != null)
        .filter((item) => matchesCardSuggestionQuery(item, query));

      this.cacheSinglesSuggestionImages(suggestions);
      return suggestions;
    },

    onSinglesItemSearchUpdate(this: any, nextValue: string): void {
      this.singlesItemSearchText = String(nextValue || "");
      if (this.suppressNextSinglesItemSearchUpdate) {
        this.suppressNextSinglesItemSearchUpdate = false;
        return;
      }
      const query = this.singlesItemSearchText.trim();
      const currentItem = String(this.editingSinglesRow?.item || "").trim();
      if (query.toLocaleLowerCase() !== currentItem.toLocaleLowerCase()) {
        if (this.showCatalogSuggestions) {
          this.editingSinglesRow.item = "";
        }
        this.editingSinglesRow.image = "";
        if (this.showCatalogSuggestions) {
          this.editingSinglesRow.cardNumber = "";
        }
      }
      this.cancelSinglesItemSearch();

      if (!this.showCatalogSuggestions || query.length < 2) {
        this.singlesItemSuggestions = [];
        this.singlesItemMenuOpen = false;
        this.singlesItemSearchLoading = false;
        return;
      }

      this.singlesItemSearchTimerId = setTimeout(() => {
        this.singlesItemSearchTimerId = null;
        void this.fetchSinglesItemSuggestions(query);
      }, SINGLES_CARD_SEARCH_DEBOUNCE_MS);
    },

    async fetchSinglesItemSuggestions(this: any, query: string): Promise<void> {
      const catalogSource = normalizeSinglesCatalogSource(this.currentSinglesCatalogSource);
      if (catalogSource === "none") {
        this.singlesItemSuggestions = [];
        this.singlesItemMenuOpen = false;
        this.singlesItemSearchLoading = false;
        return;
      }
      const apiBase = this.resolveCardsApiBaseUrl();
      if (!apiBase) {
        this.singlesItemSuggestions = [];
        this.singlesItemMenuOpen = false;
        return;
      }

      const requestSeq = this.singlesItemSearchRequestSeq + 1;
      this.singlesItemSearchRequestSeq = requestSeq;
      const controller = new AbortController();
      this.singlesItemSearchAbortController = controller;
      this.singlesItemSearchLoading = true;

      try {
        const suggestions = await this.requestSinglesCardSuggestions(query, controller.signal);

        if (this.singlesItemSearchRequestSeq !== requestSeq) return;
        this.singlesItemSuggestions = suggestions;
        this.singlesItemMenuOpen = suggestions.length > 0;
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Failed to fetch card suggestions", error);
        if (this.singlesItemSearchRequestSeq === requestSeq) {
          this.singlesItemSuggestions = [];
          this.singlesItemMenuOpen = false;
        }
      } finally {
        if (this.singlesItemSearchAbortController === controller) {
          this.singlesItemSearchAbortController = null;
        }
        if (this.singlesItemSearchRequestSeq === requestSeq) {
          this.singlesItemSearchLoading = false;
        }
      }
    },

    setCurrentSinglesCatalogSource(this: any, nextValue: SinglesCatalogSource): void {
      if (!this.currentLotId) return;
      const normalized = normalizeSinglesCatalogSource(nextValue);
      const lot = (this.lots as Array<Record<string, unknown>>).find((candidate) => candidate.id === this.currentLotId);
      if (!lot || lot.lotType !== "singles") return;
      if (lot.singlesCatalogSource === normalized) return;
      const hasExistingItems = Array.isArray(lot.singlesPurchases) && lot.singlesPurchases.length > 0;

      lot.singlesCatalogSource = normalized;
      this.saveLotsToStorage?.();
      this.cancelSinglesItemSearch();
      this.singlesItemSuggestions = [];
      this.singlesItemMenuOpen = false;
      this.singlesEditorPreviewLoading = false;
      this.singlesItemSearchLoading = false;

      if (hasExistingItems) {
        this.notify(
          "Catalog source updated. This only affects future autocomplete suggestions; existing items stay unchanged.",
          "info"
        );
      }
    },

    chooseSinglesCatalogSource(this: any, nextValue: SinglesCatalogSource): void {
      this.setCurrentSinglesCatalogSource(nextValue);
      this.showCatalogSourceSheet = false;
    },

    onSinglesCatalogSelectionChange(this: any, selectedValue: string | null): void {
      if (!selectedValue) return;
      const items = Array.isArray(this.singlesEditorCatalogItems)
        ? this.singlesEditorCatalogItems as SinglesCardSuggestion[]
        : [];
      const resolved = items.find((item) => item.value === selectedValue) || null;
      if (!resolved) return;
      this.onSinglesItemSelected(resolved);
    },

    onSinglesItemSelected(this: any, selected: string | SinglesCardSuggestion | null): void {
      if (!selected) return;
      const resolved = typeof selected === "string"
        ? (this.singlesItemSuggestions as SinglesCardSuggestion[]).find((item) => item.value === selected) || null
        : selected;
      if (!resolved) return;
      this.editingSinglesRow.item = resolved.name;
      this.editingSinglesRow.image = String(resolved.image || "");
      this.suppressNextSinglesItemSearchUpdate = true;
      this.singlesItemSearchText = "";
      this.singlesItemMenuOpen = false;
      this.cacheSinglesSuggestionImages([resolved]);
      if (this.showCatalogSuggestions) {
        this.editingSinglesRow.cardNumber = String(resolved.cardNo || "");
      } else if (!String(this.editingSinglesRow.cardNumber || "").trim() && resolved.cardNo) {
        this.editingSinglesRow.cardNumber = resolved.cardNo;
      }
      const parsedMarket = Number(resolved.marketPrice);
      if ((Number(this.editingSinglesRow.marketValue) || 0) <= 0 && Number.isFinite(parsedMarket) && parsedMarket > 0) {
        this.editingSinglesRow.marketValue = parsedMarket;
      }
      void this.preloadSinglesEditorPreview();
    },

    clearSinglesCatalogSelection(this: any): void {
      this.cancelSinglesItemSearch();
      this.editingSinglesRow.item = "";
      this.editingSinglesRow.cardNumber = "";
      this.editingSinglesRow.image = "";
      this.singlesItemSearchText = "";
      this.singlesItemSuggestions = [];
      this.singlesItemMenuOpen = false;
      this.singlesItemSearchLoading = false;
    },

    onSinglesItemBackspace(this: any, event: KeyboardEvent): void {
      if (!this.showCatalogSuggestions) return;
      const activeSearch = String(this.singlesItemSearchText || "");
      if (activeSearch.length > 0) return;

      const selectedItem = String(this.editingSinglesRow?.item || "").trim();
      if (!selectedItem) return;

      event.preventDefault();
      this.editingSinglesRow.item = "";
      this.editingSinglesRow.cardNumber = "";
      this.editingSinglesRow.image = "";
      this.onSinglesItemSearchUpdate(selectedItem);
    },

    maybeOpenSinglesItemSuggestions(this: any): void {
      if (!this.showCatalogSuggestions) return;
      const searchQuery = String(this.singlesItemSearchText || "").trim();
      if (searchQuery.length >= 2) {
        if (Array.isArray(this.singlesItemSuggestions) && this.singlesItemSuggestions.length > 0) {
          this.singlesItemMenuOpen = true;
          return;
        }
        void this.fetchSinglesItemSuggestions(searchQuery);
        return;
      }

      const selectedQuery = String(this.editingSinglesRow.item || "").trim();
      if (selectedQuery.length < 2) return;
      this.singlesItemMenuOpen = false;
      if (this.singlesItemSearchLoading) return;
      if (Array.isArray(this.singlesItemSuggestions) && this.singlesItemSuggestions.length > 0) {
        const normalizedSelected = selectedQuery.toLocaleLowerCase();
        const suggestionsMatchSelection = (this.singlesItemSuggestions as SinglesCardSuggestion[]).some((suggestion) =>
          String(suggestion.name || "").trim().toLocaleLowerCase() === normalizedSelected
        );
        if (suggestionsMatchSelection) {
          this.singlesItemMenuOpen = true;
          return;
        }
      }
      void this.fetchSinglesItemSuggestions(selectedQuery);
    },

    async preloadSinglesEditorPreview(this: any): Promise<void> {
      if (!this.showCatalogSuggestions) {
        this.singlesEditorPreviewLoading = false;
        return;
      }

      const item = String(this.editingSinglesRow?.item || "").trim();
      const cardNo = String(this.editingSinglesRow?.cardNumber || "").trim();
      if (item.length < 2) {
        this.singlesEditorPreviewLoading = false;
        return;
      }

      const exactKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, item, cardNo);
      const nameKey = createSinglesCardImageCacheKey(this.currentSinglesCatalogSource, item, "");
      const cache = this.singlesCardImageCache as Record<string, string>;
      if ((exactKey && cache?.[exactKey]) || (nameKey && cache?.[nameKey])) {
        this.editingSinglesRow.image = String(cache?.[exactKey] || cache?.[nameKey] || "");
        this.singlesEditorPreviewLoading = false;
        return;
      }

      const requestSeq = Number(this.singlesEditorPreviewRequestSeq || 0) + 1;
      this.singlesEditorPreviewRequestSeq = requestSeq;
      this.singlesEditorPreviewLoading = true;

      try {
        await this.requestSinglesCardSuggestions(item);
        const nextCache = this.singlesCardImageCache as Record<string, string>;
        this.editingSinglesRow.image = String(nextCache?.[exactKey] || nextCache?.[nameKey] || "");
      } catch (error) {
        console.warn("Failed to preload singles preview", error);
      } finally {
        if (this.singlesEditorPreviewRequestSeq === requestSeq) {
          this.singlesEditorPreviewLoading = false;
        }
      }
    },

    formatSuggestionRarity(this: any, value: unknown): string {
      const rarity = String(value || "").trim();
      if (!rarity) return "—";
      return rarity;
    },

    handleAddSinglesPurchase(this: any): void {
      this.openSinglesRowEditor();
    },

    openSinglesRowEditor(this: any, entry?: SinglesPurchaseEntry): void {
      if (entry) {
        this.editingSinglesRowId = entry.id;
        this.editingSinglesRow = {
          item: String(entry.item || ""),
          cardNumber: String(entry.cardNumber || ""),
          image: String(entry.image || ""),
          condition: String(entry.condition || ""),
          language: String(entry.language || ""),
          cost: Number(entry.cost) || 0,
          currency: entry.currency === "USD" || entry.currency === "CAD"
            ? entry.currency
            : (this.currency === "USD" ? "USD" : "CAD"),
          quantity: Number(entry.quantity) || 1,
          marketValue: Number(entry.marketValue) || 0
        };
        this.suppressNextSinglesItemSearchUpdate = true;
        this.singlesItemSearchText = "";
      } else {
        this.editingSinglesRowId = null;
        this.resetSinglesRowDraft();
      }
      this.showSinglesRowEditor = true;
      this.singlesItemMenuOpen = false;
      void this.preloadSinglesEditorPreview();
    },

    closeSinglesRowEditor(this: any): void {
      this.showSinglesRowEditor = false;
      this.singlesEditorPreviewLoading = false;
      this.editingSinglesRowId = null;
      this.resetSinglesRowDraft();
    },

    saveSinglesRowEditor(this: any, mode: "close" | "new" = "close"): void {
      const nextItem = String(this.editingSinglesRow.item || "").trim();
      const nextCardNumber = String(this.editingSinglesRow.cardNumber || "").trim();
      const nextImage = String(this.editingSinglesRow.image || "").trim();
      const nextCondition = String(this.editingSinglesRow.condition || "").trim();
      const nextLanguage = String(this.editingSinglesRow.language || "").trim();
      const parsedCost = Number(this.editingSinglesRow.cost);
      const nextCurrency = this.editingSinglesRow.currency === "USD" ? "USD" : "CAD";
      const parsedQuantity = Number(this.editingSinglesRow.quantity);
      const parsedMarketValue = Number(this.editingSinglesRow.marketValue);

      if (!nextItem) {
        this.notify("Item is required.", "warning");
        return;
      }
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        this.notify("Cost is required.", "warning");
        return;
      }
      if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
        this.notify("Quantity must be 0 or greater.", "warning");
        return;
      }

      const nextCost = parsedCost;
      const nextQuantity = Math.floor(parsedQuantity);
      const nextMarketValue = Number.isFinite(parsedMarketValue) && parsedMarketValue >= 0 ? parsedMarketValue : 0;
      const isAdding = this.editingSinglesRowId == null;

      if (isAdding) {
        const nextId = createNextSinglesEntryId(this.singlesPurchases as SinglesPurchaseEntry[]);
        this.singlesPurchases = [
          ...this.singlesPurchases,
          {
            id: nextId,
            item: nextItem,
            cardNumber: nextCardNumber,
            image: nextImage,
            condition: nextCondition,
            language: nextLanguage,
            cost: nextCost,
            currency: nextCurrency,
            quantity: nextQuantity,
            marketValue: nextMarketValue
          }
        ];
      } else {
        this.singlesPurchases = this.singlesPurchases.map((entry: SinglesPurchaseEntry) => (
          entry.id === this.editingSinglesRowId
            ? {
              ...entry,
              item: nextItem,
              cardNumber: nextCardNumber,
              image: nextImage,
              condition: nextCondition,
              language: nextLanguage,
              cost: nextCost,
              currency: nextCurrency,
              quantity: nextQuantity,
              marketValue: nextMarketValue
            }
            : entry
        ));
      }

      this.onSinglesPurchaseRowsChange();
      if (isAdding && mode === "new") {
        this.editingSinglesRowId = null;
        this.resetSinglesRowDraft({
          currency: nextCurrency,
          condition: nextCondition,
          language: nextLanguage
        });
        this.showSinglesRowEditor = true;
        return;
      }
      this.closeSinglesRowEditor();
    },

    removeSinglesRowFromEditor(this: any): void {
      if (this.editingSinglesRowId == null) {
        this.closeSinglesRowEditor();
        return;
      }
      this.confirmRemoveSinglesPurchaseRow(this.editingSinglesRowId, true);
    },

    confirmRemoveSinglesPurchaseRow(this: any, rowId: number, closeEditor = false): void {
      this.askConfirmation(
        {
          title: "Delete Row?",
          text: "Remove this singles purchase row?",
          color: "error"
        },
        () => {
          this.removeSinglesPurchaseRow(rowId);
          if (closeEditor) {
            this.closeSinglesRowEditor();
          }
        }
      );
    },

    loadSinglesInfoNoticeState(this: any): void {
      try {
        this.showSinglesInfoNotice = localStorage.getItem(SINGLES_INFO_NOTICE_DISMISSED_KEY) !== "1";
      } catch {
        this.showSinglesInfoNotice = true;
      }
    },

    dismissSinglesInfoNotice(this: any): void {
      this.showSinglesInfoNotice = false;
      try {
        localStorage.setItem(SINGLES_INFO_NOTICE_DISMISSED_KEY, "1");
      } catch {
        // Ignore storage failures.
      }
    },

    onDesktopRowsScroll(this: any, event: Event): void {
      if (!this.useDesktopVirtualization) return;
      const target = event.target as HTMLElement | null;
      this.desktopRowsScrollTop = Number(target?.scrollTop) || 0;
    },

    onSinglesSearchInput(this: any): void {
      this.resetMobileRowsPagination();
      this.resetDesktopRowsScroll();
    },

    resetMobileRowsPagination(this: any): void {
      this.mobileRenderCount = MOBILE_RENDER_INITIAL_COUNT;
    },

    loadMoreMobileRows(this: any): void {
      const nextCount = this.mobileRenderCount + MOBILE_RENDER_BATCH_COUNT;
      const getSortedRows = this.mobileSortedSinglesPurchases as (() => SinglesPurchaseEntry[]) | SinglesPurchaseEntry[] | undefined;
      const resolvedRows = typeof getSortedRows === "function"
        ? getSortedRows.call(this)
        : (getSortedRows ?? this.visibleSinglesPurchases);
      const maxCount = Array.isArray(resolvedRows)
        ? resolvedRows.length
        : 0;
      this.mobileRenderCount = Math.min(nextCount, maxCount);
    },

    cycleMobileSort(this: any): void {
      const current = String(this.mobileSortBy || "recent");
      if (current === "recent") {
        this.mobileSortBy = "item";
      } else if (current === "item") {
        this.mobileSortBy = "marketValue";
      } else {
        this.mobileSortBy = "recent";
      }
      this.resetMobileRowsPagination();
    },

    toggleShowFullySoldSingles(this: any): void {
      this.showFullySoldSingles = !this.showFullySoldSingles;
      this.resetMobileRowsPagination();
      this.resetDesktopRowsScroll();
    },

    resetDesktopRowsScroll(this: any): void {
      this.desktopRowsScrollTop = 0;
      const scroller = (this.$refs as Record<string, unknown> | undefined)?.desktopRowsScroller as
        | { scrollTop?: number }
        | undefined;
      if (scroller && typeof scroller === "object") {
        scroller.scrollTop = 0;
      }
    },

    toggleDesktopSelectMode(this: any): void {
      this.isDesktopSelectMode = !this.isDesktopSelectMode;
      if (!this.isDesktopSelectMode) {
        this.clearDesktopSelection();
      }
    },

    clearDesktopSelection(this: any): void {
      this.selectedDesktopRowIds = [];
    },

    isDesktopRowSelected(this: any, rowId: number): boolean {
      return this.selectedDesktopRowIds.includes(rowId);
    },

    toggleDesktopRowSelection(this: any, rowId: number): void {
      if (this.isDesktopRowSelected(rowId)) {
        this.selectedDesktopRowIds = this.selectedDesktopRowIds.filter((id: number) => id !== rowId);
        return;
      }
      this.selectedDesktopRowIds = [...this.selectedDesktopRowIds, rowId];
    },

    handleDesktopRowClick(this: any, entry: SinglesPurchaseEntry): void {
      if (this.isDesktopSelectMode) {
        this.toggleDesktopRowSelection(entry.id);
        return;
      }
      this.openSinglesRowEditor(entry);
    },

    deleteSelectedDesktopRows(this: any): void {
      const selectedSet = new Set((this.selectedDesktopRowIds || []).map((value: unknown) => Number(value)));
      const selectedCount = selectedSet.size;
      if (selectedCount <= 0) return;

      this.askConfirmation(
        {
          title: "Delete Selected Rows?",
          text: `Remove ${selectedCount} selected row${selectedCount === 1 ? "" : "s"}?`,
          color: "error"
        },
        () => {
          this.singlesPurchases = (this.singlesPurchases as SinglesPurchaseEntry[])
            .filter((entry) => !selectedSet.has(Number(entry.id)));
          this.onSinglesPurchaseRowsChange();
          this.clearDesktopSelection();
          this.isDesktopSelectMode = false;
          this.notify(`Deleted ${selectedCount} row${selectedCount === 1 ? "" : "s"}.`, "info");
        }
      );
    },

    toggleDesktopSort(this: any, sortBy: SinglesDesktopSortKeyWithMeta): void {
      if (this.desktopSortBy !== sortBy) {
        this.desktopSortBy = sortBy;
        this.desktopSortDesc = false;
        this.resetDesktopRowsScroll();
        return;
      }

      if (!this.desktopSortDesc) {
        this.desktopSortDesc = true;
        this.resetDesktopRowsScroll();
        return;
      }

      this.desktopSortBy = null;
      this.desktopSortDesc = false;
      this.resetDesktopRowsScroll();
    },

    sortIconFor(this: any, sortBy: SinglesDesktopSortKeyWithMeta): string {
      if (this.desktopSortBy !== sortBy) return "mdi-swap-vertical";
      return this.desktopSortDesc ? "mdi-arrow-down" : "mdi-arrow-up";
    },

    conditionShortLabel(this: any, value: unknown): string {
      return toConditionAbbreviation(value);
    },

    languageShortLabel(this: any, value: unknown): string {
      return toLanguageAbbreviation(value);
    }
  },
  watch: {
    visibleSinglesPurchases(this: any): void {
      const maxCount = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases.length
        : 0;
      if (this.mobileRenderCount > maxCount) {
        this.mobileRenderCount = maxCount;
      }
    }
  },
  mounted(this: any) {
    this.loadSinglesInfoNoticeState();
    this.resetMobileRowsPagination();
  },
  beforeUnmount(this: any) {
    this.cancelSinglesItemSearch();
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
