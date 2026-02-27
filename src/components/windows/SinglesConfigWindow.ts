import template from "./SinglesConfigWindow.html?raw";
import "./ConfigWindow.css";
import "./SinglesConfigWindow.css";
import { inject, type PropType } from "vue";
import type { SinglesPurchaseEntry } from "../../types/app.ts";
import { STORAGE_KEYS } from "../../app-core/storageKeys.ts";
import { createWindowContextBridge } from "./contextBridge.ts";
import { singlesImportComputed, singlesImportMethods } from "./singles/useSinglesImport.ts";
import { SinglesCsvImportDialog } from "./singles/SinglesCsvImportDialog.ts";

const SINGLES_INFO_NOTICE_DISMISSED_KEY = "whatfees_singles_info_notice_dismissed_v1";
type SinglesDesktopSortKey = "item" | "cardNumber" | "cost" | "quantity" | "marketValue";
const DESKTOP_VIRTUAL_THRESHOLD = 150;
const DESKTOP_VIRTUAL_ROW_HEIGHT = 52;
const DESKTOP_VIRTUAL_VIEWPORT_HEIGHT = 560;
const DESKTOP_VIRTUAL_BUFFER_ROWS = 6;
const MOBILE_RENDER_INITIAL_COUNT = 60;
const MOBILE_RENDER_BATCH_COUNT = 60;
const SINGLES_CARD_SEARCH_DEBOUNCE_MS = 400;
const SINGLES_CARD_SEARCH_LIMIT = 10;
type SinglesCatalogSource = "ua" | "pokemon" | "none";

type CardSearchApiItem = {
  name?: string;
  cardNo?: string;
  rarity?: string;
  marketPrice?: number | null;
};

type SinglesCardSuggestion = {
  title: string;
  name: string;
  cardNo: string;
  rarity: string;
  marketPrice: number | null;
};

function resolveDefaultSinglesCatalogSourceFromEnv(): SinglesCatalogSource {
  const game = String((import.meta.env.VITE_CARDS_SEARCH_GAME as string | undefined) || "ua").trim().toLowerCase();
  if (game === "none") return "none";
  if (game === "pokemon" || game === "pkmn") return "pokemon";
  return "ua";
}

function normalizeSinglesCatalogSource(
  value: unknown,
  fallback: SinglesCatalogSource = resolveDefaultSinglesCatalogSourceFromEnv()
): SinglesCatalogSource {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "none") return "none";
  if (raw === "pokemon" || raw === "pkmn") return "pokemon";
  if (raw === "ua") return "ua";
  return fallback;
}

function normalizeSinglesSearchTokens(query: unknown): string[] {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((token) => token.length > 0);
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
    SinglesCsvImportDialog
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
      showFullySoldSingles: true,
      singlesSearchQuery: "",
      isDesktopSelectMode: false,
      selectedDesktopRowIds: [] as number[],
      desktopSortBy: null as SinglesDesktopSortKeyWithMeta | null,
      desktopSortDesc: false,
      desktopRowsScrollTop: 0,
      mobileRenderCount: MOBILE_RENDER_INITIAL_COUNT,
      editingSinglesRowId: null as number | null,
      editingSinglesRow: {
        item: "",
        cardNumber: "",
        condition: "",
        language: "",
        cost: 0,
        currency: "CAD" as "CAD" | "USD",
        quantity: 1,
        marketValue: 0
      },
      singlesItemSearchText: "",
      singlesItemSearchLoading: false,
      singlesItemSuggestions: [] as SinglesCardSuggestion[],
      singlesItemSearchTimerId: null as ReturnType<typeof setTimeout> | null,
      singlesItemSearchAbortController: null as AbortController | null,
      singlesItemSearchRequestSeq: 0,
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
      const rows = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases as SinglesPurchaseEntry[]
        : [];
      const cappedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return rows.slice(0, cappedCount);
    },

    hasMoreMobileSinglesRows(this: any): boolean {
      const totalRows = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases.length
        : 0;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return totalRows > renderedCount;
    },

    remainingMobileSinglesRows(this: any): number {
      const totalRows = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases.length
        : 0;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return Math.max(0, totalRows - renderedCount);
    },

    nextMobileSinglesBatchCount(this: any): number {
      const totalRows = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases.length
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

    resetSinglesRowDraft(this: any): void {
      this.editingSinglesRow = {
        item: "",
        cardNumber: "",
        condition: "",
        language: "",
        cost: 0,
        currency: this.currency === "USD" ? "USD" : "CAD",
        quantity: 1,
        marketValue: 0
      };
      this.singlesItemSearchText = "";
      this.singlesItemSuggestions = [];
      this.singlesItemSearchLoading = false;
      this.cancelSinglesItemSearch();
    },

    resolveCardsApiBaseUrl(this: any): string {
      const configuredBase = String((import.meta.env.VITE_API_BASE_URL as string | undefined) || "").trim();
      if (configuredBase) return configuredBase.replace(/\/+$/, "");
      const cachedBase = String(localStorage.getItem(STORAGE_KEYS.API_BASE_URL) || "").trim();
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

    onSinglesItemSearchUpdate(this: any, nextValue: string): void {
      this.singlesItemSearchText = String(nextValue || "");
      const query = this.singlesItemSearchText.trim();
      this.cancelSinglesItemSearch();

      if (!this.showCatalogSuggestions || query.length < 2) {
        this.singlesItemSuggestions = [];
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
        this.singlesItemSearchLoading = false;
        return;
      }
      const apiBase = this.resolveCardsApiBaseUrl();
      if (!apiBase) {
        this.singlesItemSuggestions = [];
        return;
      }

      const requestSeq = this.singlesItemSearchRequestSeq + 1;
      this.singlesItemSearchRequestSeq = requestSeq;
      const controller = new AbortController();
      this.singlesItemSearchAbortController = controller;
      this.singlesItemSearchLoading = true;

      try {
        const url = new URL(`${apiBase}/cards/search`);
        url.searchParams.set("game", catalogSource);
        url.searchParams.set("q", query);
        url.searchParams.set("limit", String(SINGLES_CARD_SEARCH_LIMIT));

        const response = await fetch(url.toString(), {
          method: "GET",
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Cards search failed (${response.status})`);

        const payload = await response.json() as { items?: CardSearchApiItem[] };
        const items = Array.isArray(payload.items) ? payload.items : [];
        const suggestions = items
          .map((item) => {
            const name = String(item.name || "").trim();
            if (!name) return null;
            const cardNo = String(item.cardNo || "").trim();
            const rarity = String(item.rarity || "").trim();
            const marketPriceRaw = Number(item.marketPrice);
            const marketPrice = Number.isFinite(marketPriceRaw) ? marketPriceRaw : null;
            return {
              title: cardNo ? `${name} #${cardNo}` : name,
              name,
              cardNo,
              rarity,
              marketPrice
            } satisfies SinglesCardSuggestion;
          })
          .filter((item): item is SinglesCardSuggestion => item != null);

        if (this.singlesItemSearchRequestSeq !== requestSeq) return;
        this.singlesItemSuggestions = suggestions;
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Failed to fetch card suggestions", error);
        if (this.singlesItemSearchRequestSeq === requestSeq) {
          this.singlesItemSuggestions = [];
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

    onSinglesItemSelected(this: any, selected: string | SinglesCardSuggestion | null): void {
      if (!selected || typeof selected === "string") return;
      this.editingSinglesRow.item = selected.name;
      if (!String(this.editingSinglesRow.cardNumber || "").trim() && selected.cardNo) {
        this.editingSinglesRow.cardNumber = selected.cardNo;
      }
      const parsedMarket = Number(selected.marketPrice);
      if ((Number(this.editingSinglesRow.marketValue) || 0) <= 0 && Number.isFinite(parsedMarket) && parsedMarket > 0) {
        this.editingSinglesRow.marketValue = parsedMarket;
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
          condition: String(entry.condition || ""),
          language: String(entry.language || ""),
          cost: Number(entry.cost) || 0,
          currency: entry.currency === "USD" || entry.currency === "CAD"
            ? entry.currency
            : (this.currency === "USD" ? "USD" : "CAD"),
          quantity: Number(entry.quantity) || 1,
          marketValue: Number(entry.marketValue) || 0
        };
      } else {
        this.editingSinglesRowId = null;
        this.resetSinglesRowDraft();
      }
      this.showSinglesRowEditor = true;
    },

    closeSinglesRowEditor(this: any): void {
      this.showSinglesRowEditor = false;
      this.editingSinglesRowId = null;
      this.resetSinglesRowDraft();
    },

    saveSinglesRowEditor(this: any): void {
      const nextItem = String(this.editingSinglesRow.item || "").trim();
      const nextCardNumber = String(this.editingSinglesRow.cardNumber || "").trim();
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

      if (this.editingSinglesRowId == null) {
        const nextId = createNextSinglesEntryId(this.singlesPurchases as SinglesPurchaseEntry[]);
        this.singlesPurchases = [
          ...this.singlesPurchases,
          {
            id: nextId,
            item: nextItem,
            cardNumber: nextCardNumber,
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
      const maxCount = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases.length
        : 0;
      this.mobileRenderCount = Math.min(nextCount, maxCount);
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
