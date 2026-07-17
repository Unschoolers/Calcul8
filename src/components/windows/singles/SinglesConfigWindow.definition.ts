import { inject, type PropType } from "vue";
import { compareLocalizedText } from "../../../app-core/i18n/index.ts";
import { resolveDefaultSinglesMarketValueCurrency } from "../../../app-core/shared/singles-market-value-currency.ts";
import {
  resolveVuetifySlotNumber,
  resolveVuetifySlotString,
  resolveVuetifySlotValue
} from "../../../app-core/shared/vuetify-slot-items.ts";
import { getSinglesEntryUnitMarketValueInSellingCurrency } from "../../../domain/calculations.ts";
import type { CurrencyCode, SinglesCatalogSource, SinglesPurchaseEntry } from "../../../types/app.ts";
import { createWindowContextBridge } from "../shared/contextBridge.ts";
import { normalizeSinglesSearchTokens } from "./singlesCatalogSearch.ts";
import {
    createSinglesCatalogSearchState,
    singlesCatalogSearchComputed,
    singlesCatalogSearchMethods
} from "./useSinglesCatalogSearch.ts";
import { singlesImportComputed, singlesImportMethods } from "./useSinglesImport.ts";
import { singlesRowEditorMethods } from "./useSinglesRowEditor.ts";

const SINGLES_INFO_NOTICE_DISMISSED_KEY = "whatfees_singles_info_notice_dismissed_v1";
type SinglesDesktopSortKey = "item" | "cardNumber" | "cost" | "quantity" | "marketValue";
type SinglesMobileSortKey = "recent" | "item" | "marketValue";
const DESKTOP_VIRTUAL_THRESHOLD = 150;
const DESKTOP_VIRTUAL_ROW_HEIGHT = 104;
const DESKTOP_VIRTUAL_VIEWPORT_HEIGHT = 560;
const DESKTOP_VIRTUAL_BUFFER_ROWS = 6;
const MOBILE_RENDER_INITIAL_COUNT = 30;
const MOBILE_RENDER_BATCH_COUNT = 30;

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

type SinglesWindowThis = {
  // ===== Local data =====
  showSinglesInfoNotice: boolean;
  showSinglesRowEditor: boolean;
  showFullySoldSingles: boolean;
  singlesSearchQuery: string;
  isDesktopSelectMode: boolean;
  selectedDesktopRowIds: number[];
  desktopSortBy: SinglesDesktopSortKeyWithMeta | null;
  desktopSortDesc: boolean;
  desktopRowsScrollTop: number;
  desktopRowsScrollerEl: { scrollTop?: number } | null;
  mobileRenderCount: number;
  mobileSortBy: SinglesMobileSortKey;
  editingSinglesRowId: number | null;
  singlesImageUploadBusy: boolean;
  singlesImageUploadError: string;
  singlesImageUploadRequestSeq: number;
  editingSinglesRow: {
    item: string;
    cardNumber: string;
    externalSku: string;
    image: string;
    condition: string;
    language: string;
    cost: number;
    currency: "CAD" | "USD";
    quantity: number;
    marketValue: number;
    marketValueCurrency: "CAD" | "USD";
  };

  // ===== AppContext bridge =====
  singlesPurchases: SinglesPurchaseEntry[];
  singlesSoldCountByPurchaseId: Record<number, number>;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  preferredLanguage: string;
  currentSinglesCatalogSource: SinglesCatalogSource | undefined;
  formatCurrency?: ((value: number | null | undefined, decimals?: number) => string);
  t?: (key: string) => string;
  notify?(message: string, type?: string): void;
  askConfirmation?(options: { title: string; text: string; color?: string }, confirm: () => void): void;
  onSinglesPurchaseRowsChange?(): void;

  // ===== Computed =====
  visibleSinglesPurchases: SinglesPurchaseEntry[];
  hasSinglesSearchQuery: boolean;
  mobileRenderedSinglesPurchases: SinglesPurchaseEntry[];
  mobileSortedSinglesPurchases: SinglesPurchaseEntry[];
  mobileSortLabel: string;
  hasMoreMobileSinglesRows: boolean;
  remainingMobileSinglesRows: number;
  nextMobileSinglesBatchCount: number;
  desktopSortedSinglesPurchases: SinglesPurchaseEntry[];
  useDesktopVirtualization: boolean;
  desktopVirtualStartIndex: number;
  desktopVirtualEndIndex: number;
  desktopRenderedRows: SinglesPurchaseEntry[];
  desktopTopSpacerPx: number;
  desktopBottomSpacerPx: number;

  // ===== Methods =====
  fmtCurrency(value: number | null | undefined, decimals?: number): string;
  getEditingSinglesDefaultMarketValueCurrency(): "CAD" | "USD";
  getSinglesEntryMarketValueCurrency(entry: SinglesPurchaseEntry): "CAD" | "USD";
  getSinglesEntryMarketValueInSellingCurrency(entry: SinglesPurchaseEntry): number;
  getSinglesEntryMarketTotalInSellingCurrency(entry: SinglesPurchaseEntry, quantity?: number): number;
  getSinglesSoldQuantity(entryId: number): number;
  getSinglesEntryRemainingQuantity(entry: SinglesPurchaseEntry): number;
  getSinglesEntryTotalQuantity(entry: SinglesPurchaseEntry): number;
  getSinglesEntryStockLabel(entry: SinglesPurchaseEntry): string;
  isSinglesEntryFullySold(entry: SinglesPurchaseEntry): boolean;
  loadSinglesInfoNoticeState(): void;
  dismissSinglesInfoNotice(): void;
  onDesktopRowsScroll(event: Event): void;
  onSinglesSearchInput(): void;
  resetMobileRowsPagination(): void;
  loadMoreMobileRows(): void;
  cycleMobileSort(): void;
  toggleShowFullySoldSingles(): void;
  resetDesktopRowsScroll(): void;
  setDesktopRowsScrollerRef(element: unknown): void;
  getWindowComponentContext(): Record<string, unknown>;
  toggleDesktopSelectMode(): void;
  clearDesktopSelection(): void;
  isDesktopRowSelected(rowId: number): boolean;
  toggleDesktopRowSelection(rowId: number): void;
  handleDesktopRowClick(entry: SinglesPurchaseEntry): void;
  deleteSelectedDesktopRows(): void;
  toggleDesktopSort(sortBy: SinglesDesktopSortKeyWithMeta): void;
  sortIconFor(sortBy: SinglesDesktopSortKeyWithMeta): string;
  conditionShortLabel(value: unknown): string;
  languageShortLabel(value: unknown): string;
  cancelSinglesItemSearch(): void;
  openSinglesRowEditor(entry: SinglesPurchaseEntry): void;

  // ===== Row editor spread methods =====
  [key: string]: unknown;
};

/** Resolves the computed list in both Vue and direct controller-method tests. */
function getMobileSortedSinglesRows(context: SinglesWindowThis): SinglesPurchaseEntry[] {
  const source = context.mobileSortedSinglesPurchases as (() => SinglesPurchaseEntry[]) | SinglesPurchaseEntry[] | undefined;
  const rows = typeof source === "function" ? source.call(context) : source ?? context.visibleSinglesPurchases;
  return Array.isArray(rows) ? rows as SinglesPurchaseEntry[] : [];
}

function getSinglesTotalQuantity(entry: SinglesPurchaseEntry): number {
  const quantity = Number(entry.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
}

function getDesktopSinglesSortValue(
  context: SinglesWindowThis,
  entry: SinglesPurchaseEntry,
  sortBy: SinglesDesktopSortKeyWithMeta
): string | number {
  if (sortBy === "item" || sortBy === "cardNumber" || sortBy === "condition" || sortBy === "language") {
    const field = sortBy === "item" ? "item" : sortBy;
    return String(entry[field] || "").trim();
  }
  const quantity = getSinglesTotalQuantity(entry);
  if (sortBy === "cost") return Math.max(0, (Number(entry.cost) || 0) * quantity);
  if (sortBy === "quantity") return quantity;
  return context.getSinglesEntryMarketTotalInSellingCurrency(entry, quantity);
}

export const singlesConfigWindowDefinition = {
  name: "SinglesConfigWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      ...createSinglesCatalogSearchState(),
      showSinglesInfoNotice: true,
      showSinglesRowEditor: false,
      showFullySoldSingles: false,
      singlesSearchQuery: "",
      isDesktopSelectMode: false,
      selectedDesktopRowIds: [] as number[],
      desktopSortBy: null as SinglesDesktopSortKeyWithMeta | null,
      desktopSortDesc: false,
      desktopRowsScrollTop: 0,
      desktopRowsScrollerEl: null as { scrollTop?: number } | null,
      mobileRenderCount: MOBILE_RENDER_INITIAL_COUNT,
      mobileSortBy: "item" as SinglesMobileSortKey,
      editingSinglesRowId: null as number | null,
      singlesImageUploadBusy: false,
      singlesImageUploadError: "",
      singlesImageUploadRequestSeq: 0,
      editingSinglesRow: {
        item: "",
        cardNumber: "",
        externalSku: "",
        image: "",
        condition: "",
        language: "",
        cost: 0,
        currency: "CAD" as "CAD" | "USD",
        quantity: 1,
        marketValue: 0,
        marketValueCurrency: "CAD" as "CAD" | "USD"
      },
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
    ...singlesCatalogSearchComputed,

    visibleSinglesPurchases(this: SinglesWindowThis): SinglesPurchaseEntry[] {
      const rows = Array.isArray(this.singlesPurchases)
        ? this.singlesPurchases as SinglesPurchaseEntry[]
        : [];
      const soldFilteredRows = this.showFullySoldSingles
        ? rows
        : rows.filter((entry) => !this.isSinglesEntryFullySold(entry));

      const tokens = normalizeSinglesSearchTokens(this.singlesSearchQuery);
      if (tokens.length === 0) return soldFilteredRows;

      return soldFilteredRows.filter((entry) => {
        const locale = this?.preferredLanguage || undefined;
        const itemText = String(entry.item || "").toLocaleLowerCase(locale);
        const cardNumberText = String(entry.cardNumber || "").toLocaleLowerCase(locale);
        const haystack = `${cardNumberText} ${itemText}`;
        return tokens.every((token) => haystack.includes(token));
      });
    },

    hasSinglesSearchQuery(this: SinglesWindowThis): boolean {
      return normalizeSinglesSearchTokens(this.singlesSearchQuery).length > 0;
    },

    mobileRenderedSinglesPurchases(this: SinglesWindowThis): SinglesPurchaseEntry[] {
      const cappedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return getMobileSortedSinglesRows(this).slice(0, cappedCount);
    },

    mobileSortedSinglesPurchases(this: SinglesWindowThis): SinglesPurchaseEntry[] {
      const rows = Array.isArray(this.visibleSinglesPurchases)
        ? [...this.visibleSinglesPurchases as SinglesPurchaseEntry[]]
        : [];
      const sortBy = String(this.mobileSortBy || "recent") as SinglesMobileSortKey;
      if (sortBy === "recent") return rows;

      if (sortBy === "item") {
        return rows.sort((a, b) => compareLocalizedText(String(a.item || ""), String(b.item || ""), this?.preferredLanguage || ""));
      }

      return rows.sort((a, b) => {
        const totalQuantityA = Math.max(0, Math.floor(Number(a.quantity) || 0));
        const totalQuantityB = Math.max(0, Math.floor(Number(b.quantity) || 0));
        const valueA = this.getSinglesEntryMarketTotalInSellingCurrency(a, totalQuantityA);
        const valueB = this.getSinglesEntryMarketTotalInSellingCurrency(b, totalQuantityB);
        if (valueA !== valueB) return valueB - valueA;
        return compareLocalizedText(String(a.item || ""), String(b.item || ""), this?.preferredLanguage || "");
      });
    },

    mobileSortLabel(this: SinglesWindowThis): string {
      const sortBy = String(this.mobileSortBy || "recent");
      const t = this?.t as ((key: string) => string) | undefined;
      if (sortBy === "item") return typeof t === "function" ? t("singlesMobileSortNameLabel") : "Name";
      if (sortBy === "marketValue") return typeof t === "function" ? t("singlesMobileSortMarketLabel") : "Market";
      return typeof t === "function" ? t("singlesMobileSortRecentLabel") : "Recent";
    },

    hasMoreMobileSinglesRows(this: SinglesWindowThis): boolean {
      const totalRows = getMobileSortedSinglesRows(this).length;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return totalRows > renderedCount;
    },

    remainingMobileSinglesRows(this: SinglesWindowThis): number {
      const totalRows = getMobileSortedSinglesRows(this).length;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      return Math.max(0, totalRows - renderedCount);
    },

    nextMobileSinglesBatchCount(this: SinglesWindowThis): number {
      const totalRows = getMobileSortedSinglesRows(this).length;
      const renderedCount = Math.max(0, Math.floor(Number(this.mobileRenderCount) || 0));
      const remainingRows = Math.max(0, totalRows - renderedCount);
      return Math.min(MOBILE_RENDER_BATCH_COUNT, remainingRows);
    },

    desktopSortedSinglesPurchases(this: SinglesWindowThis): SinglesPurchaseEntry[] {
      const rows = Array.isArray(this.visibleSinglesPurchases)
        ? [...this.visibleSinglesPurchases as SinglesPurchaseEntry[]]
        : [];

      if (!this.desktopSortBy) return rows;

      const sortBy = this.desktopSortBy;
      const direction = this.desktopSortDesc ? -1 : 1;
      const withIndex = rows.map((entry, index) => ({ entry, index }));

      withIndex.sort((a, b) => {
        const valueA = getDesktopSinglesSortValue(this, a.entry, sortBy);
        const valueB = getDesktopSinglesSortValue(this, b.entry, sortBy);
        if (typeof valueA === "string" && typeof valueB === "string") {
          const compare = compareLocalizedText(valueA, valueB, this?.preferredLanguage || "");
          if (compare !== 0) return compare * direction;
          return a.index - b.index;
        }
        const numericA = Number(valueA);
        const numericB = Number(valueB);
        if (numericA !== numericB) return (numericA - numericB) * direction;
        return a.index - b.index;
      });

      return withIndex.map((row) => row.entry);
    },

    useDesktopVirtualization(this: SinglesWindowThis): boolean {
      return (this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[]).length >= DESKTOP_VIRTUAL_THRESHOLD;
    },

    desktopVirtualStartIndex(this: SinglesWindowThis): number {
      if (!this.useDesktopVirtualization) return 0;
      const firstVisibleIndex = Math.floor(Math.max(0, this.desktopRowsScrollTop) / DESKTOP_VIRTUAL_ROW_HEIGHT);
      return Math.max(0, firstVisibleIndex - DESKTOP_VIRTUAL_BUFFER_ROWS);
    },

    desktopVirtualEndIndex(this: SinglesWindowThis): number {
      const totalRows = (this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[]).length;
      if (!this.useDesktopVirtualization) return totalRows;
      const visibleRows = Math.ceil(DESKTOP_VIRTUAL_VIEWPORT_HEIGHT / DESKTOP_VIRTUAL_ROW_HEIGHT);
      return Math.min(
        totalRows,
        this.desktopVirtualStartIndex + visibleRows + (DESKTOP_VIRTUAL_BUFFER_ROWS * 2)
      );
    },

    desktopRenderedRows(this: SinglesWindowThis): SinglesPurchaseEntry[] {
      const rows = this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[];
      if (!this.useDesktopVirtualization) return rows;
      return rows.slice(this.desktopVirtualStartIndex, this.desktopVirtualEndIndex);
    },

    desktopTopSpacerPx(this: SinglesWindowThis): number {
      if (!this.useDesktopVirtualization) return 0;
      return this.desktopVirtualStartIndex * DESKTOP_VIRTUAL_ROW_HEIGHT;
    },

    desktopBottomSpacerPx(this: SinglesWindowThis): number {
      if (!this.useDesktopVirtualization) return 0;
      const totalRows = (this.desktopSortedSinglesPurchases as SinglesPurchaseEntry[]).length;
      return Math.max(0, (totalRows - this.desktopVirtualEndIndex) * DESKTOP_VIRTUAL_ROW_HEIGHT);
    }
  },
  methods: {
    ...singlesImportMethods,
    ...singlesCatalogSearchMethods,
    resolveVuetifySlotNumber,
    resolveVuetifySlotString,
    resolveVuetifySlotValue,
    fmtCurrency(this: SinglesWindowThis, value: number | null | undefined, decimals = 2): string {
      const formatter = this?.formatCurrency as
        | ((nextValue: number | null | undefined, nextDecimals?: number) => string)
        | undefined;
      if (typeof formatter === "function") {
        return formatter.call(this, value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(0);
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(Number(value));
    },

    getEditingSinglesDefaultMarketValueCurrency(this: SinglesWindowThis): "CAD" | "USD" {
      return resolveDefaultSinglesMarketValueCurrency(
        this.currentSinglesCatalogSource,
        this.editingSinglesRow?.currency === "USD" ? "USD" : "CAD"
      );
    },

    getSinglesEntryMarketValueCurrency(this: SinglesWindowThis, entry: SinglesPurchaseEntry): "CAD" | "USD" {
      return entry.marketValueCurrency === "USD" || entry.marketValueCurrency === "CAD"
        ? entry.marketValueCurrency
        : resolveDefaultSinglesMarketValueCurrency(
          this.currentSinglesCatalogSource,
          entry.currency === "USD" ? "USD" : "CAD"
        );
    },

    getSinglesEntryMarketValueInSellingCurrency(this: SinglesWindowThis, entry: SinglesPurchaseEntry): number {
      return getSinglesEntryUnitMarketValueInSellingCurrency(
        entry,
        entry.currency === "USD" ? "USD" : "CAD",
        this.sellingCurrency === "USD" ? "USD" : "CAD",
        Number(this.exchangeRate) || 0
      );
    },

    getSinglesEntryMarketTotalInSellingCurrency(this: SinglesWindowThis, entry: SinglesPurchaseEntry, quantity?: number): number {
      const resolvedQuantity = quantity ?? this.getSinglesEntryTotalQuantity(entry);
      return this.getSinglesEntryMarketValueInSellingCurrency(entry) * Math.max(0, Number(resolvedQuantity) || 0);
    },

    getSinglesSoldQuantity(this: SinglesWindowThis, entryId: number): number {
      const soldById = this.singlesSoldCountByPurchaseId as Record<number, number> | undefined;
      const soldQuantity = Number(soldById?.[entryId] ?? 0);
      if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) return 0;
      return Math.floor(soldQuantity);
    },

    getSinglesEntryRemainingQuantity(this: SinglesWindowThis, entry: SinglesPurchaseEntry): number {
      const totalQuantity = this.getSinglesEntryTotalQuantity(entry);
      const soldQuantity = this.getSinglesSoldQuantity(entry.id);
      return Math.max(0, totalQuantity - soldQuantity);
    },

    getSinglesEntryTotalQuantity(this: SinglesWindowThis, entry: SinglesPurchaseEntry): number {
      const totalQuantity = Number(entry.quantity);
      if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) return 0;
      return Math.floor(totalQuantity);
    },

    getSinglesEntryStockLabel(this: SinglesWindowThis, entry: SinglesPurchaseEntry): string {
      const remainingQuantity = this.getSinglesEntryRemainingQuantity(entry);
      const totalQuantity = this.getSinglesEntryTotalQuantity(entry);
      return `${remainingQuantity}/${totalQuantity}`;
    },

    isSinglesEntryFullySold(this: SinglesWindowThis, entry: SinglesPurchaseEntry): boolean {
      const remainingQuantity = this.getSinglesEntryRemainingQuantity(entry);
      const totalQuantity = this.getSinglesEntryTotalQuantity(entry);
      return totalQuantity > 0 && remainingQuantity === 0;
    },

    loadSinglesInfoNoticeState(this: SinglesWindowThis): void {
      try {
        this.showSinglesInfoNotice = localStorage.getItem(SINGLES_INFO_NOTICE_DISMISSED_KEY) !== "1";
      } catch {
        this.showSinglesInfoNotice = true;
      }
    },

    dismissSinglesInfoNotice(this: SinglesWindowThis): void {
      this.showSinglesInfoNotice = false;
      try {
        localStorage.setItem(SINGLES_INFO_NOTICE_DISMISSED_KEY, "1");
      } catch {
        // Ignore storage failures.
      }
    },

    onDesktopRowsScroll(this: SinglesWindowThis, event: Event): void {
      if (!this.useDesktopVirtualization) return;
      const target = event.target as HTMLElement | null;
      this.desktopRowsScrollTop = Number(target?.scrollTop) || 0;
    },

    onSinglesSearchInput(this: SinglesWindowThis): void {
      this.resetMobileRowsPagination();
      this.resetDesktopRowsScroll();
    },

    resetMobileRowsPagination(this: SinglesWindowThis): void {
      this.mobileRenderCount = MOBILE_RENDER_INITIAL_COUNT;
    },

    loadMoreMobileRows(this: SinglesWindowThis): void {
      const nextCount = this.mobileRenderCount + MOBILE_RENDER_BATCH_COUNT;
      const maxCount = getMobileSortedSinglesRows(this).length;
      this.mobileRenderCount = Math.min(nextCount, maxCount);
    },

    cycleMobileSort(this: SinglesWindowThis): void {
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

    toggleShowFullySoldSingles(this: SinglesWindowThis): void {
      this.showFullySoldSingles = !this.showFullySoldSingles;
      this.resetMobileRowsPagination();
      this.resetDesktopRowsScroll();
    },

    resetDesktopRowsScroll(this: SinglesWindowThis): void {
      this.desktopRowsScrollTop = 0;
      const scroller = this.desktopRowsScrollerEl as
        | { scrollTop?: number }
        | null;
      if (scroller && typeof scroller === "object") {
        scroller.scrollTop = 0;
      }
    },

    setDesktopRowsScrollerRef(this: SinglesWindowThis, element: unknown): void {
      this.desktopRowsScrollerEl = (element && typeof element === "object")
        ? element as { scrollTop?: number }
        : null;
    },

    getWindowComponentContext(this: SinglesWindowThis): Record<string, unknown> {
      return this as Record<string, unknown>;
    },

    toggleDesktopSelectMode(this: SinglesWindowThis): void {
      this.isDesktopSelectMode = !this.isDesktopSelectMode;
      if (!this.isDesktopSelectMode) {
        this.clearDesktopSelection();
      }
    },

    clearDesktopSelection(this: SinglesWindowThis): void {
      this.selectedDesktopRowIds = [];
    },

    isDesktopRowSelected(this: SinglesWindowThis, rowId: number): boolean {
      return this.selectedDesktopRowIds.includes(rowId);
    },

    toggleDesktopRowSelection(this: SinglesWindowThis, rowId: number): void {
      if (this.isDesktopRowSelected(rowId)) {
        this.selectedDesktopRowIds = this.selectedDesktopRowIds.filter((id: number) => id !== rowId);
        return;
      }
      this.selectedDesktopRowIds = [...this.selectedDesktopRowIds, rowId];
    },

    handleDesktopRowClick(this: SinglesWindowThis, entry: SinglesPurchaseEntry): void {
      if (this.isDesktopSelectMode) {
        this.toggleDesktopRowSelection(entry.id);
        return;
      }
      this.openSinglesRowEditor(entry);
    },

    deleteSelectedDesktopRows(this: SinglesWindowThis): void {
      const selectedSet = new Set((this.selectedDesktopRowIds || []).map((value: unknown) => Number(value)));
      const selectedCount = selectedSet.size;
      if (selectedCount <= 0) return;
      const t = this?.t as ((key: string) => string) | undefined;
      const pluralSuffix = selectedCount === 1 ? "" : "s";
      const deleteTitle = typeof t === "function" ? t("singlesDeleteSelectedRowsTitle") : "Delete Selected Rows?";
      const deleteBody = typeof t === "function"
        ? t("singlesDeleteSelectedRowsBody")
          .replace(/\{\{count\}\}|\{count\}/g, String(selectedCount))
          .replace(/\{\{suffix\}\}|\{suffix\}/g, pluralSuffix)
        : `Remove ${selectedCount} selected row${selectedCount === 1 ? "" : "s"}?`;
      const deletedBody = typeof t === "function"
        ? t("singlesDeletedRowsToast")
          .replace(/\{\{count\}\}|\{count\}/g, String(selectedCount))
          .replace(/\{\{suffix\}\}|\{suffix\}/g, pluralSuffix)
        : `Deleted ${selectedCount} row${selectedCount === 1 ? "" : "s"}.`;

      this.askConfirmation?.(
        {
          title: deleteTitle,
          text: deleteBody,
          color: "error"
        },
        () => {
          this.singlesPurchases = (this.singlesPurchases as SinglesPurchaseEntry[])
            .filter((entry) => !selectedSet.has(Number(entry.id)));
          this.onSinglesPurchaseRowsChange?.();
          this.clearDesktopSelection();
          this.isDesktopSelectMode = false;
          this.notify?.(deletedBody, "info");
        }
      );
    },

    toggleDesktopSort(this: SinglesWindowThis, sortBy: SinglesDesktopSortKeyWithMeta): void {
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

    sortIconFor(this: SinglesWindowThis, sortBy: SinglesDesktopSortKeyWithMeta): string {
      if (this.desktopSortBy !== sortBy) return "mdi-swap-vertical";
      return this.desktopSortDesc ? "mdi-arrow-down" : "mdi-arrow-up";
    },

    conditionShortLabel(this: SinglesWindowThis, value: unknown): string {
      return toConditionAbbreviation(value);
    },

    languageShortLabel(this: SinglesWindowThis, value: unknown): string {
      return toLanguageAbbreviation(value);
    },
    ...singlesRowEditorMethods
  },
  watch: {
    visibleSinglesPurchases(this: SinglesWindowThis): void {
      const maxCount = Array.isArray(this.visibleSinglesPurchases)
        ? this.visibleSinglesPurchases.length
        : 0;
      if (this.mobileRenderCount > maxCount) {
        this.mobileRenderCount = maxCount;
      }
    }
  },
  mounted(this: SinglesWindowThis) {
    this.loadSinglesInfoNoticeState();
    this.resetMobileRowsPagination();
  },
  beforeUnmount(this: SinglesWindowThis) {
    this.cancelSinglesItemSearch();
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  }
};
