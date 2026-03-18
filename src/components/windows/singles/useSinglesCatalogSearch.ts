import type { SinglesCatalogSource, SinglesPurchaseEntry } from "../../../types/app.ts";
import { STORAGE_KEYS } from "../../../app-core/storageKeys.ts";
import { normalizeSinglesCatalogSource } from "../../../app-core/shared/singles-catalog-source.ts";
import {
  createSinglesCardImageCacheKey,
  createSinglesCardSuggestionValue,
  mapCardSearchItemToSuggestion,
  matchesCardSuggestionQuery,
  resolveCardSearchBackendQuery,
  SINGLES_CARD_SEARCH_DEBOUNCE_MS,
  SINGLES_CARD_SEARCH_LIMIT,
  type CardSearchApiItem,
  type SinglesCardSuggestion
} from "./singlesCatalogSearch.ts";

type EditableSinglesRow = {
  item: string;
  cardNumber: string;
  image: string;
  condition: string;
  language: string;
  cost: number;
  currency: "CAD" | "USD";
  quantity: number;
  marketValue: number;
};

type SinglesCatalogSearchContext = {
  currentLotId: number | string | null;
  lots: Array<Record<string, unknown>>;
  currentLotCatalogSource?: SinglesCatalogSource;
  currentSinglesCatalogSource: SinglesCatalogSource;
  showCatalogSourceSheet: boolean;
  showSinglesImagePreview: boolean;
  singlesImagePreviewSrc: string;
  singlesImagePreviewTitle: string;
  editingSinglesRow: EditableSinglesRow;
  singlesItemSearchText: string;
  singlesItemMenuOpen: boolean;
  singlesEditorPreviewLoading: boolean;
  singlesItemSearchLoading: boolean;
  suppressNextSinglesItemSearchUpdate: boolean;
  singlesCardImageCache: Record<string, string>;
  singlesItemSuggestions: SinglesCardSuggestion[];
  singlesItemSearchTimerId: ReturnType<typeof setTimeout> | null;
  singlesItemSearchAbortController: AbortController | null;
  singlesItemSearchRequestSeq: number;
  singlesEditorPreviewRequestSeq: number;
  showCatalogSuggestions: boolean;
  singlesEditorCatalogItems: SinglesCardSuggestion[];
  saveLotsToStorage?(): void;
  notify(message: string, color?: string): void;
  formatSinglesEditorItemLabel(item: unknown, cardNumber: unknown): string;
  resolveCardsApiBaseUrl(): string;
  cacheSinglesSuggestionImages(suggestions: SinglesCardSuggestion[]): void;
  setCurrentSinglesCatalogSource(nextValue: SinglesCatalogSource): void;
  onSinglesItemSelected(selected: string | SinglesCardSuggestion | null): void;
  onSinglesItemSearchUpdate(nextValue: string): void;
  preloadSinglesEditorPreview(): Promise<void>;
  cancelSinglesItemSearch(): void;
  fetchSinglesItemSuggestions(query: string): Promise<void>;
  requestSinglesCardSuggestions(query: string, signal?: AbortSignal): Promise<SinglesCardSuggestion[]>;
};

function resolveSinglesLot(context: SinglesCatalogSearchContext): Record<string, unknown> | null {
  if (!context.currentLotId) return null;
  const lots = Array.isArray(context.lots) ? context.lots : [];
  const lot = lots.find((candidate) => candidate.id === context.currentLotId);
  if (!lot || lot.lotType !== "singles") return null;
  return lot;
}

function resolveCachedSinglesImage(
  cache: Record<string, string> | undefined,
  catalogSource: SinglesCatalogSource,
  item: unknown,
  cardNumber: unknown
): string {
  const exactKey = createSinglesCardImageCacheKey(catalogSource, item, cardNumber);
  if (exactKey && typeof cache?.[exactKey] === "string" && cache[exactKey]) {
    return cache[exactKey];
  }

  const nameKey = createSinglesCardImageCacheKey(catalogSource, item, "");
  if (nameKey && typeof cache?.[nameKey] === "string" && cache[nameKey]) {
    return cache[nameKey];
  }

  return "";
}

export function createSinglesCatalogSearchState(): Record<string, unknown> {
  return {
    showCatalogSourceSheet: false,
    showSinglesImagePreview: false,
    singlesImagePreviewSrc: "",
    singlesImagePreviewTitle: "",
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
    singlesEditorPreviewRequestSeq: 0
  };
}

export const singlesCatalogSearchComputed = {
  currentSinglesCatalogSource: {
    get(this: SinglesCatalogSearchContext): SinglesCatalogSource {
      const lot = resolveSinglesLot(this);
      if (!lot) return "none";
      return normalizeSinglesCatalogSource(
        lot.singlesCatalogSource,
        normalizeSinglesCatalogSource(this.currentLotCatalogSource)
      );
    },
    set(this: SinglesCatalogSearchContext, nextValue: SinglesCatalogSource): void {
      this.setCurrentSinglesCatalogSource(nextValue);
    }
  },

  showCatalogSuggestions(this: SinglesCatalogSearchContext): boolean {
    return this.currentSinglesCatalogSource !== "none";
  },

  currentSinglesCatalogSourceLabel(this: SinglesCatalogSearchContext): string {
    const source = normalizeSinglesCatalogSource(this.currentSinglesCatalogSource);
    if (source === "pokemon") return "Pokemon";
    if (source === "none") return "Custom";
    return "Union Arena";
  },

  singlesEditorCatalogItems(this: SinglesCatalogSearchContext): SinglesCardSuggestion[] {
    const suggestions = Array.isArray(this.singlesItemSuggestions)
      ? [...this.singlesItemSuggestions]
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

  currentSinglesEditorSelectionValue(this: SinglesCatalogSearchContext): string | null {
    const activeSearch = String(this.singlesItemSearchText || "").trim();
    if (activeSearch) return null;
    const item = String(this.editingSinglesRow?.item || "").trim();
    if (!item) return null;
    const cardNo = String(this.editingSinglesRow?.cardNumber || "").trim();
    const rarity = Array.isArray(this.singlesItemSuggestions)
      ? String(
        this.singlesItemSuggestions.find((suggestion) => (
          String(suggestion.name || "").trim() === item
          && String(suggestion.cardNo || "").trim() === cardNo
        ))?.rarity || ""
      ).trim()
      : "";
    return createSinglesCardSuggestionValue(item, cardNo, rarity);
  },

  editingSinglesPreviewImage(this: SinglesCatalogSearchContext): string {
    const item = String(this.editingSinglesRow?.item || "").trim();
    if (!item) return "";
    const directImage = String(this.editingSinglesRow?.image || "").trim();
    if (directImage) return directImage;

    const cardNo = String(this.editingSinglesRow?.cardNumber || "").trim();
    const itemLower = item.toLocaleLowerCase();
    const cardNoLower = cardNo.toLocaleLowerCase();
    const matchingSuggestion = Array.isArray(this.singlesItemSuggestions)
      ? this.singlesItemSuggestions.find((suggestion) => {
        if (!suggestion.image) return false;
        if (String(suggestion.name || "").trim().toLocaleLowerCase() !== itemLower) return false;
        if (!cardNoLower) return true;
        return String(suggestion.cardNo || "").trim().toLocaleLowerCase() === cardNoLower;
      })
      : null;

    if (matchingSuggestion?.image) return matchingSuggestion.image;

    return resolveCachedSinglesImage(
      this.singlesCardImageCache,
      this.currentSinglesCatalogSource,
      item,
      cardNo
    );
  }
};

export const singlesCatalogSearchMethods = {
  getSinglesEntryPreviewImage(this: SinglesCatalogSearchContext, entry: SinglesPurchaseEntry): string {
    const directImage = String(entry.image || "").trim();
    if (directImage) return directImage;
    return resolveCachedSinglesImage(
      this.singlesCardImageCache,
      this.currentSinglesCatalogSource,
      entry.item,
      entry.cardNumber
    );
  },

  openSinglesImagePreview(this: SinglesCatalogSearchContext, image: unknown, title?: unknown): void {
    const src = String(image || "").trim();
    if (!src) return;
    this.singlesImagePreviewSrc = src;
    this.singlesImagePreviewTitle = String(title || "").trim();
    this.showSinglesImagePreview = true;
  },

  closeSinglesImagePreview(this: SinglesCatalogSearchContext): void {
    this.showSinglesImagePreview = false;
    this.singlesImagePreviewSrc = "";
    this.singlesImagePreviewTitle = "";
  },

  formatSinglesEditorItemLabel(this: SinglesCatalogSearchContext, item: unknown, cardNumber: unknown): string {
    const safeItem = String(item || "").trim();
    const safeCardNumber = String(cardNumber || "").trim();
    if (!safeItem) return "";
    if (!this.showCatalogSuggestions || !safeCardNumber) return safeItem;
    return `${safeItem} #${safeCardNumber}`;
  },

  resolveCardsApiBaseUrl(this: SinglesCatalogSearchContext): string {
    const configuredBase = String((import.meta.env.VITE_API_BASE_URL as string | undefined) || "").trim();
    if (configuredBase) return configuredBase.replace(/\/+$/, "");
    const storage = (globalThis as { localStorage?: { getItem?: (key: string) => string | null } }).localStorage;
    const cachedBase = String(storage?.getItem?.(STORAGE_KEYS.API_BASE_URL) || "").trim();
    if (cachedBase) return cachedBase.replace(/\/+$/, "");
    return "";
  },

  cancelSinglesItemSearch(this: SinglesCatalogSearchContext): void {
    if (this.singlesItemSearchTimerId) {
      clearTimeout(this.singlesItemSearchTimerId);
      this.singlesItemSearchTimerId = null;
    }
    if (this.singlesItemSearchAbortController) {
      this.singlesItemSearchAbortController.abort();
      this.singlesItemSearchAbortController = null;
    }
  },

  cacheSinglesSuggestionImages(this: SinglesCatalogSearchContext, suggestions: SinglesCardSuggestion[]): void {
    if (!Array.isArray(suggestions) || suggestions.length === 0) return;
    const nextCache = {
      ...(this.singlesCardImageCache || {})
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
    this: SinglesCatalogSearchContext,
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

  onSinglesItemSearchUpdate(this: SinglesCatalogSearchContext, nextValue: string): void {
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

  async fetchSinglesItemSuggestions(this: SinglesCatalogSearchContext, query: string): Promise<void> {
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

  setCurrentSinglesCatalogSource(this: SinglesCatalogSearchContext, nextValue: SinglesCatalogSource): void {
    const lot = resolveSinglesLot(this);
    if (!lot) return;

    const normalized = normalizeSinglesCatalogSource(nextValue);
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

  chooseSinglesCatalogSource(this: SinglesCatalogSearchContext, nextValue: SinglesCatalogSource): void {
    this.setCurrentSinglesCatalogSource(nextValue);
    this.showCatalogSourceSheet = false;
  },

  onSinglesCatalogSelectionChange(this: SinglesCatalogSearchContext, selectedValue: string | null): void {
    if (!selectedValue) return;
    const items = Array.isArray(this.singlesEditorCatalogItems)
      ? this.singlesEditorCatalogItems
      : [];
    const resolved = items.find((item) => item.value === selectedValue) || null;
    if (!resolved) return;
    this.onSinglesItemSelected(resolved);
  },

  onSinglesItemSelected(this: SinglesCatalogSearchContext, selected: string | SinglesCardSuggestion | null): void {
    if (!selected) return;
    const resolved = typeof selected === "string"
      ? this.singlesItemSuggestions.find((item) => item.value === selected) || null
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

  clearSinglesCatalogSelection(this: SinglesCatalogSearchContext): void {
    this.cancelSinglesItemSearch();
    this.editingSinglesRow.item = "";
    this.editingSinglesRow.cardNumber = "";
    this.editingSinglesRow.image = "";
    this.singlesItemSearchText = "";
    this.singlesItemSuggestions = [];
    this.singlesItemMenuOpen = false;
    this.singlesItemSearchLoading = false;
  },

  onSinglesItemBackspace(this: SinglesCatalogSearchContext, event: KeyboardEvent): void {
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

  maybeOpenSinglesItemSuggestions(this: SinglesCatalogSearchContext): void {
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
      const suggestionsMatchSelection = this.singlesItemSuggestions.some((suggestion) =>
        String(suggestion.name || "").trim().toLocaleLowerCase() === normalizedSelected
      );
      if (suggestionsMatchSelection) {
        this.singlesItemMenuOpen = true;
        return;
      }
    }
    void this.fetchSinglesItemSuggestions(selectedQuery);
  },

  async preloadSinglesEditorPreview(this: SinglesCatalogSearchContext): Promise<void> {
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

    const cachedImage = resolveCachedSinglesImage(
      this.singlesCardImageCache,
      this.currentSinglesCatalogSource,
      item,
      cardNo
    );
    if (cachedImage) {
      this.editingSinglesRow.image = cachedImage;
      this.singlesEditorPreviewLoading = false;
      return;
    }

    const requestSeq = Number(this.singlesEditorPreviewRequestSeq || 0) + 1;
    this.singlesEditorPreviewRequestSeq = requestSeq;
    this.singlesEditorPreviewLoading = true;

    try {
      await this.requestSinglesCardSuggestions(item);
      this.editingSinglesRow.image = resolveCachedSinglesImage(
        this.singlesCardImageCache,
        this.currentSinglesCatalogSource,
        item,
        cardNo
      );
    } catch (error) {
      console.warn("Failed to preload singles preview", error);
    } finally {
      if (this.singlesEditorPreviewRequestSeq === requestSeq) {
        this.singlesEditorPreviewLoading = false;
      }
    }
  },

  formatSuggestionRarity(this: SinglesCatalogSearchContext, value: unknown): string {
    const rarity = String(value || "").trim();
    if (!rarity) return "—";
    return rarity;
  }
};
