import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot, LotSetup, SinglesCatalogSource, SinglesPurchaseEntry } from "../../types/app.ts";
import {
  applySinglesCsvImportRows,
  buildSinglesCsvImportDraft,
  isValidCsvColumnIndex,
  parseSinglesCsvRowsWithMapping,
  summarizeSinglesCsvImportOutcome
} from "./config-lots-import.ts";
import {
  getLegacySalesStorageKey,
  getLegacyStorageKeys,
  getScopedLastLotStorageKey,
  readStorageWithLegacy,
  removeStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";
import { normalizeSinglesCatalogSource } from "../shared/singles-catalog-source.ts";
import { type ConfigMethodSubset, getTodayDate, inferDateFromLotId, toDateOnly } from "./config-shared.ts";
import { toNonNegativeInt as toNonNegativeInteger, toNonNegativeNumber } from "../shared/singles-normalizers.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import {
  canUseAuthoritativeSalesLiveApi,
  fetchAuthoritativeLivePricing,
  fetchAuthoritativeSales,
  SalesLiveApiError,
  saveAuthoritativeLivePricing
} from "./sales-live-api.ts";
import { markLivePricingPollingBaseline } from "./ui/lot-entity-polling.ts";
import { queueWorkspaceConfigSyncPush } from "./ui/workspace-config-sync.ts";

type QueuedLivePricingSaveContext = {
  currentLotId: number | null;
  liveSpotPrice: number;
  liveBoxPriceSell: number;
  livePackPrice: number;
  currentLivePricingVersion: number | null;
  notify(message: string, color?: string): void;
};

type QueuedLivePricingSnapshot = {
  lotId: number;
  liveSpotPrice: number;
  liveBoxPriceSell: number;
  livePackPrice: number;
  baseVersion: number;
};

type LivePricingQueueState = {
  timeoutId: number | null;
  inFlight: boolean;
  queuedSnapshot: QueuedLivePricingSnapshot | null;
  lastSavedHash: string | null;
};

const LIVE_PRICING_SAVE_DELAY_MS = 500;
const livePricingQueueStateByContext = new WeakMap<object, LivePricingQueueState>();

function getLivePricingQueueState(context: object): LivePricingQueueState {
  let state = livePricingQueueStateByContext.get(context);
  if (!state) {
    state = {
      timeoutId: null,
      inFlight: false,
      queuedSnapshot: null,
      lastSavedHash: null
    };
    livePricingQueueStateByContext.set(context, state);
  }
  return state;
}

function createLivePricingHash(snapshot: QueuedLivePricingSnapshot): string {
  return JSON.stringify({
    lotId: snapshot.lotId,
    liveSpotPrice: Number(snapshot.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(snapshot.liveBoxPriceSell) || 0,
    livePackPrice: Number(snapshot.livePackPrice) || 0,
    baseVersion: Math.max(0, Number(snapshot.baseVersion) || 0)
  });
}

async function flushQueuedLivePricingSave(
  context: QueuedLivePricingSaveContext & {
    currentLivePricingVersion: number | null;
    liveSpotPrice: number;
    liveBoxPriceSell: number;
    livePackPrice: number;
  },
  notifySuccess = true
): Promise<void> {
  const state = getLivePricingQueueState(context as object);
  if (state.inFlight || !state.queuedSnapshot) {
    return;
  }

  const snapshot = state.queuedSnapshot;
  const snapshotHash = createLivePricingHash(snapshot);
  if (state.lastSavedHash === snapshotHash) {
    state.queuedSnapshot = null;
    return;
  }

  state.inFlight = true;
  state.queuedSnapshot = null;

  try {
    const saved = await saveAuthoritativeLivePricing(context as never, snapshot.lotId, {
      liveSpotPrice: snapshot.liveSpotPrice,
      liveBoxPriceSell: snapshot.liveBoxPriceSell,
      livePackPrice: snapshot.livePackPrice,
      currentLivePricingVersion: snapshot.baseVersion
    } as never);
    context.currentLivePricingVersion = saved.version;
    state.lastSavedHash = createLivePricingHash({
      lotId: snapshot.lotId,
      liveSpotPrice: saved.liveSpotPrice,
      liveBoxPriceSell: saved.liveBoxPriceSell,
      livePackPrice: saved.livePackPrice,
      baseVersion: saved.version ?? 0
    });
    markLivePricingPollingBaseline(context as object, {
      liveSpotPrice: saved.liveSpotPrice,
      liveBoxPriceSell: saved.liveBoxPriceSell,
      livePackPrice: saved.livePackPrice,
      currentLivePricingVersion: saved.version
    });
    if (notifySuccess) {
      context.notify("Live prices saved", "success");
    }
  } catch (error) {
    if (error instanceof SalesLiveApiError && error.status === 409) {
      const latest = await fetchAuthoritativeLivePricing(context as never, snapshot.lotId).catch(() => null);
      if (latest) {
        context.liveSpotPrice = latest.liveSpotPrice;
        context.liveBoxPriceSell = latest.liveBoxPriceSell;
        context.livePackPrice = latest.livePackPrice;
        context.currentLivePricingVersion = latest.version;
        state.lastSavedHash = createLivePricingHash({
          lotId: snapshot.lotId,
          liveSpotPrice: latest.liveSpotPrice,
          liveBoxPriceSell: latest.liveBoxPriceSell,
          livePackPrice: latest.livePackPrice,
          baseVersion: latest.version ?? 0
        });
        markLivePricingPollingBaseline(context as object, {
          liveSpotPrice: latest.liveSpotPrice,
          liveBoxPriceSell: latest.liveBoxPriceSell,
          livePackPrice: latest.livePackPrice,
          currentLivePricingVersion: latest.version
        });
      }
      context.notify("Live pricing changed in the cloud. Pulled latest saved prices.", "warning");
    } else {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to save live pricing.";
      context.notify(message, "error");
    }
  } finally {
    state.inFlight = false;
    if (state.queuedSnapshot) {
      void flushQueuedLivePricingSave(context, notifySuccess);
    }
  }
}

function queueAuthoritativeLivePricingSave(
  context: QueuedLivePricingSaveContext & {
    currentLivePricingVersion: number | null;
    liveSpotPrice: number;
    liveBoxPriceSell: number;
    livePackPrice: number;
  },
  lotId: number
): void {
  const state = getLivePricingQueueState(context as object);
  const nextSnapshot: QueuedLivePricingSnapshot = {
    lotId,
    liveSpotPrice: Number(context.liveSpotPrice) || 0,
    liveBoxPriceSell: Number(context.liveBoxPriceSell) || 0,
    livePackPrice: Number(context.livePackPrice) || 0,
    baseVersion: context.currentLivePricingVersion ?? 0
  };
  const nextHash = createLivePricingHash(nextSnapshot);
  if (state.lastSavedHash === nextHash && !state.inFlight) {
    return;
  }

  state.queuedSnapshot = nextSnapshot;
  if (state.timeoutId != null) {
    globalThis.clearTimeout(state.timeoutId);
  }
  state.timeoutId = globalThis.setTimeout(() => {
    state.timeoutId = null;
    void flushQueuedLivePricingSave(context, true);
  }, LIVE_PRICING_SAVE_DELAY_MS);
}

const LEGACY_KEYS = getLegacyStorageKeys();

function createNextSinglesEntryId(entries: SinglesPurchaseEntry[]): number {
  const highestId = entries.reduce((maxId, entry) => {
    const candidateId = Number(entry.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) return maxId;
    return Math.max(maxId, Math.floor(candidateId));
  }, 0);
  return Math.max(Date.now(), highestId + 1);
}

function normalizeSinglesPurchaseEntries(
  entries: SinglesPurchaseEntry[] | undefined,
  fallbackCurrency: "CAD" | "USD" = "CAD"
): SinglesPurchaseEntry[] {
  if (!Array.isArray(entries)) return [];
  const usedIds = new Set<number>();
  let nextGeneratedId = createNextSinglesEntryId(entries);

  return entries.map((entry) => {
    const parsedId = Number(entry.id);
    let id = Number.isFinite(parsedId) && parsedId > 0
      ? Math.floor(parsedId)
      : 0;
    if (id <= 0 || usedIds.has(id)) {
      while (usedIds.has(nextGeneratedId)) {
        nextGeneratedId += 1;
      }
      id = nextGeneratedId;
      nextGeneratedId += 1;
    }
    usedIds.add(id);
    const currency = entry.currency === "USD" || entry.currency === "CAD"
      ? entry.currency
      : fallbackCurrency;
    return {
      id,
      item: typeof entry.item === "string" ? entry.item.trim() : "",
      cardNumber: typeof entry.cardNumber === "string" ? entry.cardNumber.trim() : "",
      image: typeof entry.image === "string" ? entry.image.trim() : "",
      condition: typeof entry.condition === "string" ? entry.condition.trim() : "",
      language: typeof entry.language === "string" ? entry.language.trim() : "",
      cost: toNonNegativeNumber(entry.cost),
      currency,
      quantity: toNonNegativeInteger(entry.quantity),
      marketValue: toNonNegativeNumber(entry.marketValue)
    };
  });
}

function resolveCurrentLot(lots: Lot[], lotId: number | null): Lot | null {
  if (!lotId) return null;
  return lots.find((lot) => lot.id === lotId) ?? null;
}

export const configLotMethods: ConfigMethodSubset<
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "addSinglesPurchaseRow"
  | "removeSinglesPurchaseRow"
  | "clearSinglesPurchases"
  | "onSinglesPurchaseRowsChange"
  | "importSinglesPurchasesCsv"
  | "confirmSinglesPurchasesCsvImport"
  | "cancelSinglesPurchasesCsvImport"
  | "createNewLot"
  | "selectLot"
  | "setCurrentLotCatalogSource"
  | "openRenameLotModal"
  | "renameCurrentLot"
  | "loadLot"
  | "deleteCurrentLot"
> = {
  getCurrentSetup(): LotSetup {
    return {
      boxPriceCost: this.boxPriceCost,
      boxesPurchased: this.boxesPurchased,
      packsPerBox: this.packsPerBox,
      spotsPerBox: this.spotsPerBox,
      costInputMode: this.costInputMode,
      currency: this.currency,
      sellingCurrency: this.sellingCurrency,
      exchangeRate: this.exchangeRate,
      purchaseDate: this.purchaseDate,
      purchaseShippingCost: this.purchaseShippingCost,
      purchaseTaxPercent: this.purchaseTaxPercent,
      sellingTaxPercent: this.sellingTaxPercent,
      sellingShippingPerOrder: this.sellingShippingPerOrder,
      includeTax: this.includeTax,
      spotPrice: this.spotPrice,
      boxPriceSell: this.boxPriceSell,
      packPrice: this.packPrice,
      targetProfitPercent: this.targetProfitPercent
    };
  },

  autoSaveSetup(): void {
    if (!this.currentLotId) return;
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;

    Object.assign(lot, this.getCurrentSetup());
    this.saveLotsToStorage();
    queueWorkspaceConfigSyncPush(this);
  },

  syncLivePricesFromDefaults(): void {
    this.liveSpotPrice = this.spotPrice;
    this.liveBoxPriceSell = this.boxPriceSell;
    this.livePackPrice = this.packPrice;
  },

  resetLivePrices(): void {
    if (this.currentLotType === "singles") {
      this.resetLiveSinglesPricing();
      return;
    }
    this.syncLivePricesFromDefaults();
    this.notify("Live prices reset to config defaults", "info");
  },

  applyLivePricesToDefaults(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }

    if (!canUseAuthoritativeSalesLiveApi()) {
      this.spotPrice = Number(this.liveSpotPrice) || 0;
      this.boxPriceSell = Number(this.liveBoxPriceSell) || 0;
      this.packPrice = Number(this.livePackPrice) || 0;
      this.currentLivePricingVersion = null;
      this.autoSaveSetup();
      void this.pushCloudSync();
      this.notify("Live prices saved to config", "success");
      return;
    }

    const lotId = this.currentLotId;
    queueAuthoritativeLivePricingSave(this, lotId);
  },

  addSinglesPurchaseRow(): void {
    if (this.currentLotType !== "singles") return;
    const nextId = createNextSinglesEntryId(this.singlesPurchases);

    this.singlesPurchases = [
      ...this.singlesPurchases,
      {
        id: nextId,
        item: "",
        cardNumber: "",
        condition: "",
        language: "",
        cost: 0,
        currency: this.currency === "USD" ? "USD" : "CAD",
        quantity: 1,
        marketValue: 0
      }
    ];
    this.onSinglesPurchaseRowsChange();
  },

  removeSinglesPurchaseRow(rowId: number): void {
    if (this.currentLotType !== "singles") return;

    this.singlesPurchases = this.singlesPurchases.filter((entry) => entry.id !== rowId);
    this.onSinglesPurchaseRowsChange();
  },

  clearSinglesPurchases(): void {
    if (this.currentLotType !== "singles") return;
    if (this.singlesPurchases.length === 0) return;

    this.singlesPurchases = [];
    this.onSinglesPurchaseRowsChange();
    this.notify("Cleared singles purchase rows.", "info");
  },

  onSinglesPurchaseRowsChange(): void {
    if (this.currentLotType !== "singles") return;

    const normalizedRows = normalizeSinglesPurchaseEntries(
      this.singlesPurchases,
      this.currency === "USD" ? "USD" : "CAD"
    );
    this.singlesPurchases = normalizedRows;

    const lot = resolveCurrentLot(this.lots, this.currentLotId);
    if (!lot || lot.lotType !== "singles") return;

    lot.singlesPurchases = [...normalizedRows];
    this.recalculateDefaultPrices();
  },

  importSinglesPurchasesCsv(): void {
    if (this.currentLotType !== "singles") return;

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".csv,text/csv";
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = reader.result;
          if (typeof raw !== "string") {
            this.notify("Could not read CSV file.", "error");
            return;
          }

          const draft = buildSinglesCsvImportDraft(raw);
          if (!draft) {
            this.notify("No valid rows found in CSV.", "warning");
            return;
          }

          this.singlesCsvImportHeaders = draft.headers;
          this.singlesCsvImportRows = draft.rows;
          this.singlesCsvImportCurrency = this.currency === "USD" ? "USD" : "CAD";
          this.singlesCsvImportMode = "merge";
          this.singlesCsvMapItem = draft.mapping.item;
          this.singlesCsvMapCardNumber = draft.mapping.cardNumber;
          this.singlesCsvMapCondition = draft.mapping.condition;
          this.singlesCsvMapLanguage = draft.mapping.language;
          this.singlesCsvMapCost = draft.mapping.cost;
          this.singlesCsvMapQuantity = draft.mapping.quantity;
          this.singlesCsvMapMarketValue = draft.mapping.marketValue;
          this.showSinglesCsvMapperModal = true;
        } catch (error) {
          console.warn("Failed to import singles purchase CSV", error);
          this.notify("Could not import CSV. Check the file format.", "error");
        }
      };
      reader.onerror = () => {
        this.notify("Could not read CSV file.", "error");
      };
      reader.readAsText(file);
    };
    picker.click();
  },

  confirmSinglesPurchasesCsvImport(): void {
    if (this.currentLotType !== "singles") return;

    const headers = this.singlesCsvImportHeaders;
    const rows = this.singlesCsvImportRows;
    if (headers.length === 0 || rows.length === 0) {
      this.cancelSinglesPurchasesCsvImport();
      this.notify("No CSV data available to import.", "warning");
      return;
    }

    if (!isValidCsvColumnIndex(this.singlesCsvMapItem, headers.length) ||
      !isValidCsvColumnIndex(this.singlesCsvMapQuantity, headers.length)) {
      this.notify("Map Item and Quantity columns before importing.", "warning");
      return;
    }

    const parsedResult = parseSinglesCsvRowsWithMapping(rows, headers.length, {
      item: this.singlesCsvMapItem,
      cardNumber: this.singlesCsvMapCardNumber,
      condition: this.singlesCsvMapCondition,
      language: this.singlesCsvMapLanguage,
      cost: this.singlesCsvMapCost,
      quantity: this.singlesCsvMapQuantity,
      marketValue: this.singlesCsvMapMarketValue
    }, this.singlesCsvImportCurrency === "USD" ? "USD" : "CAD");
    if (parsedResult.entries.length === 0) {
      this.notify("No valid rows found with current mapping.", "warning");
      return;
    }

    const appliedImport = applySinglesCsvImportRows({
      existingRows: this.singlesPurchases,
      parsedRows: parsedResult.entries,
      importMode: this.singlesCsvImportMode
    });

    this.singlesPurchases = appliedImport.rows;
    this.onSinglesPurchaseRowsChange();
    this.cancelSinglesPurchasesCsvImport();
    this.notify(
      summarizeSinglesCsvImportOutcome({
        mode: appliedImport.mode,
        addedCount: appliedImport.addedCount,
        mergedCount: appliedImport.mergedCount,
        ambiguousCount: appliedImport.ambiguousCount,
        replacedCount: appliedImport.replacedCount,
        skippedCount: parsedResult.skippedCount
      }),
      "success"
    );
  },

  cancelSinglesPurchasesCsvImport(): void {
    this.showSinglesCsvMapperModal = false;
    this.singlesCsvImportHeaders = [];
    this.singlesCsvImportRows = [];
    this.singlesCsvImportCurrency = this.currency === "USD" ? "USD" : "CAD";
    this.singlesCsvImportMode = "merge";
    this.singlesCsvMapItem = null;
    this.singlesCsvMapCardNumber = null;
    this.singlesCsvMapCondition = null;
    this.singlesCsvMapLanguage = null;
    this.singlesCsvMapCost = null;
    this.singlesCsvMapQuantity = null;
    this.singlesCsvMapMarketValue = null;
  },

  createNewLot(): void {
    const name = (this.newLotName || "").trim();
    if (!name) return this.notify("Please enter a lot name", "warning");
    if (this.lots.some((p) => p.name === name)) return this.notify("A lot with this name already exists", "warning");

    const todayDate = getTodayDate();
    const setup = this.getCurrentSetup();
    const nextLotType: Lot["lotType"] = this.newLotType === "singles" ? "singles" : "bulk";
    const selectedLot = this.currentLotId ? this.lots.find((p) => p.id === this.currentLotId) : null;
    const selectedLotCatalogSource = normalizeSinglesCatalogSource(
      selectedLot?.lotType === "singles" ? selectedLot.singlesCatalogSource : undefined
    );
    const draftCatalogSource = normalizeSinglesCatalogSource(
      this.newLotCatalogSource,
      selectedLotCatalogSource
    );
    const nextSinglesCatalogSource: "ua" | "pokemon" | "none" =
      nextLotType === "singles"
        ? draftCatalogSource
        : "none";
    const fallbackPreviousLot = this.lots.length > 0 ? this.lots[this.lots.length - 1] : null;
    const previousSellingTaxRaw =
      selectedLot?.sellingTaxPercent ??
      fallbackPreviousLot?.sellingTaxPercent ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    const previousSellingTax = Number(previousSellingTaxRaw);
    setup.sellingTaxPercent =
      Number.isFinite(previousSellingTax) && previousSellingTax >= 0
        ? previousSellingTax
        : DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    setup.purchaseDate = todayDate;

    if (this.purchaseUiMode === "simple") {
      setup.purchaseShippingCost = 0;
      setup.purchaseTaxPercent = 0;
    }

    if (nextLotType === "singles") {
      setup.costInputMode = "total";
      setup.boxPriceCost = 0;
      setup.boxesPurchased = 0;
      setup.packsPerBox = 1;
      setup.purchaseShippingCost = 0;
      setup.purchaseTaxPercent = 0;
      setup.includeTax = false;
      setup.spotPrice = 0;
      setup.boxPriceSell = 0;
      setup.packPrice = 0;
    }

    const newLot: Lot = {
      id: Date.now(),
      name,
      createdAt: todayDate,
      lotType: nextLotType,
      singlesCatalogSource: nextLotType === "singles" ? nextSinglesCatalogSource : undefined,
      singlesPurchases: nextLotType === "singles" ? [] as SinglesPurchaseEntry[] : undefined,
      ...setup
    };
    this.lots.push(newLot);
    this.saveLotsToStorage();

    this.currentLotId = newLot.id;
    this.loadLot();
    queueWorkspaceConfigSyncPush(this);
    this.newLotName = "";
    this.newLotType = nextLotType;
    this.newLotCatalogSource = nextSinglesCatalogSource;
    this.showNewLotModal = false;
    this.notify("Lot created", "success");
  },

  selectLot(lotId: number | null): void {
    const parsedLotId = Number(lotId);
    const nextLotId = Number.isFinite(parsedLotId) && parsedLotId > 0
      ? parsedLotId
      : null;

    if (nextLotId === this.currentLotId) return;

    if (this.currentLotId) {
      this.autoSaveSetup();
    }

    this.currentLotId = nextLotId;
    if (nextLotId) {
      this.loadLot();
    }
  },

  setCurrentLotCatalogSource(nextValue: SinglesCatalogSource): void {
    if (!this.currentLotId) return;

    const lot = this.lots.find((candidate) => candidate.id === this.currentLotId);
    if (!lot || lot.lotType !== "singles") return;

    const normalizedSource = normalizeSinglesCatalogSource(
      nextValue,
      normalizeSinglesCatalogSource(lot.singlesCatalogSource)
    );
    if (lot.singlesCatalogSource === normalizedSource) return;

    const hadExistingItems = Array.isArray(lot.singlesPurchases) && lot.singlesPurchases.length > 0;
    lot.singlesCatalogSource = normalizedSource;
    this.saveLotsToStorage();
    queueWorkspaceConfigSyncPush(this);

    if (hadExistingItems) {
      this.notify(
        "Catalog source updated. This only affects future autocomplete suggestions; existing items stay unchanged.",
        "info"
      );
    }
  },

  openRenameLotModal(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    this.renameLotName = lot.name;
    this.showRenameLotModal = true;
  },

  renameCurrentLot(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }

    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;

    const nextName = String(this.renameLotName || "").trim();
    if (!nextName) {
      this.notify("Please enter a lot name", "warning");
      return;
    }

    const nextNameKey = nextName.toLocaleLowerCase();
    const hasDuplicate = this.lots.some(
      (candidate) => candidate.id !== lot.id && String(candidate.name || "").trim().toLocaleLowerCase() === nextNameKey
    );
    if (hasDuplicate) {
      this.notify("A lot with this name already exists", "warning");
      return;
    }

    const nameChanged = lot.name !== nextName;

    if (!nameChanged) {
      this.showRenameLotModal = false;
      return;
    }

    lot.name = nextName;
    this.saveLotsToStorage();
    queueWorkspaceConfigSyncPush(this);
    this.showRenameLotModal = false;
    this.renameLotName = "";

    if (this.currentTab === "portfolio") {
      void this.$nextTick(() => this.initPortfolioChart());
    }

    this.notify("Lot renamed", "success");
  },

  loadLot(): void {
    if (!this.currentLotId) return;

    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    if (lot.lotType === "singles") {
      lot.singlesCatalogSource = normalizeSinglesCatalogSource(lot.singlesCatalogSource);
    }
    this.showSinglesCsvMapperModal = false;
    this.singlesCsvImportHeaders = [];
    this.singlesCsvImportRows = [];
    this.singlesCsvImportCurrency = lot.currency === "USD" ? "USD" : "CAD";
    this.singlesCsvImportMode = "merge";
    this.singlesCsvMapItem = null;
    this.singlesCsvMapCardNumber = null;
    this.singlesCsvMapCondition = null;
    this.singlesCsvMapLanguage = null;
    this.singlesCsvMapCost = null;
    this.singlesCsvMapQuantity = null;
    this.singlesCsvMapMarketValue = null;
    this.newLotType = lot.lotType === "singles" ? "singles" : "bulk";
    this.newLotCatalogSource = lot.lotType === "singles"
      ? normalizeSinglesCatalogSource(lot.singlesCatalogSource)
      : this.newLotCatalogSource;
    const todayDate = getTodayDate();

    const hydrationRevision = (Number(this.lotHydrationRevision) || 0) + 1;
    this.lotHydrationRevision = hydrationRevision;
    this.isHydratingLotConfig = true;
    try {
      this.boxPriceCost = lot.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE;
      this.boxesPurchased = lot.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED;
      this.packsPerBox = lot.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX;
      this.spotsPerBox = lot.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX;
      this.costInputMode = lot.costInputMode ?? "perBox";
      this.currency = lot.currency ?? "CAD";
      this.sellingCurrency = lot.sellingCurrency ?? "CAD";
      this.exchangeRate = lot.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE;
      this.purchaseDate =
        toDateOnly(lot.purchaseDate) ??
        toDateOnly(lot.createdAt) ??
        inferDateFromLotId(lot.id) ??
        todayDate;
      this.purchaseShippingCost = lot.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST;

      const legacyTax = lot.taxRatePercent;
      this.purchaseTaxPercent =
        lot.purchaseTaxPercent ??
        legacyTax ??
        DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
      this.sellingTaxPercent =
        lot.sellingTaxPercent ??
        legacyTax ??
        DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
      this.sellingShippingPerOrder = lot.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER;
      this.includeTax = lot.includeTax ?? true;
      this.spotPrice = lot.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE;
      this.boxPriceSell = lot.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL;
      this.packPrice = lot.packPrice ?? DEFAULT_VALUES.PACK_PRICE;
      this.singlesPurchases = lot.lotType === "singles"
        ? normalizeSinglesPurchaseEntries(lot.singlesPurchases, lot.currency === "USD" ? "USD" : "CAD")
        : [];
      const parsedTargetProfit = Number(lot.targetProfitPercent);
      if (!this.hasProAccess) {
        this.targetProfitPercent = 0;
      } else if (Number.isFinite(parsedTargetProfit) && parsedTargetProfit >= 0) {
        this.targetProfitPercent = parsedTargetProfit;
      } else {
        this.targetProfitPercent = 15;
      }
    } finally {
      void this.$nextTick(() => {
        if (this.lotHydrationRevision === hydrationRevision) {
          this.isHydratingLotConfig = false;
        }
      });
    }

    this.currentLivePricingVersion = null;
    this.syncLivePricesFromDefaults();
    markLivePricingPollingBaseline(this as object, {
      liveSpotPrice: this.liveSpotPrice,
      liveBoxPriceSell: this.liveBoxPriceSell,
      livePackPrice: this.livePackPrice,
      currentLivePricingVersion: this.currentLivePricingVersion
    });
    this.loadSalesFromStorage();
    if (canUseAuthoritativeSalesLiveApi()) {
      const selectedLotId = lot.id;
      void (async () => {
        try {
          const [latestSales, latestLivePricing] = await Promise.all([
            fetchAuthoritativeSales(this, selectedLotId),
            fetchAuthoritativeLivePricing(this, selectedLotId)
          ]);
          if (this.currentLotId !== selectedLotId) return;
          if (latestSales) {
            this.sales = latestSales;
          }
          if (latestLivePricing) {
            this.liveSpotPrice = latestLivePricing.liveSpotPrice;
            this.liveBoxPriceSell = latestLivePricing.liveBoxPriceSell;
            this.livePackPrice = latestLivePricing.livePackPrice;
            this.currentLivePricingVersion = latestLivePricing.version;
            const state = getLivePricingQueueState(this as object);
            state.lastSavedHash = createLivePricingHash({
              lotId: selectedLotId,
              liveSpotPrice: latestLivePricing.liveSpotPrice,
              liveBoxPriceSell: latestLivePricing.liveBoxPriceSell,
              livePackPrice: latestLivePricing.livePackPrice,
              baseVersion: latestLivePricing.version ?? 0
            });
            markLivePricingPollingBaseline(this as object, {
              liveSpotPrice: latestLivePricing.liveSpotPrice,
              liveBoxPriceSell: latestLivePricing.liveBoxPriceSell,
              livePackPrice: latestLivePricing.livePackPrice,
              currentLivePricingVersion: latestLivePricing.version
            });
          } else {
            this.currentLivePricingVersion = null;
            const state = getLivePricingQueueState(this as object);
            state.lastSavedHash = null;
            markLivePricingPollingBaseline(this as object, {
              liveSpotPrice: this.liveSpotPrice,
              liveBoxPriceSell: this.liveBoxPriceSell,
              livePackPrice: this.livePackPrice,
              currentLivePricingVersion: this.currentLivePricingVersion
            });
          }
        } catch (error) {
          console.warn("Failed to hydrate authoritative lot data", error);
        }
      })();
    }
    void this.$nextTick(() => {
      if (this.currentTab === "sales") {
        this.initSalesChart();
        return;
      }
      if (this.currentTab === "portfolio") {
        this.initPortfolioChart();
      }
    });
  },

  deleteCurrentLot(): void {
    if (!this.currentLotId) return;
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    const lotIdToDelete = lot.id;
    const linkedSalesCount = this.loadSalesForLotId(lotIdToDelete).length;

    this.askConfirmation(
      {
        title: "Delete Lot?",
        text: linkedSalesCount > 0
          ? `Delete "${lot.name}" and ${linkedSalesCount} linked sale${linkedSalesCount === 1 ? "" : "s"} permanently?`
          : `Delete "${lot.name}" permanently?`,
        color: "error"
      },
      () => {
        this.lots = this.lots.filter((p) => p.id !== lotIdToDelete);
        removeStorageWithLegacy(
          this.getSalesStorageKey(lotIdToDelete),
          getLegacySalesStorageKey(lotIdToDelete)
        );
        const lastLotStorageKey = getScopedLastLotStorageKey(getActiveStorageScope(this));
        const storedLastLotId = this.activeScopeType === "workspace" && this.activeWorkspaceId
          ? localStorage.getItem(lastLotStorageKey)
          : readStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID);
        if (Number(storedLastLotId) === lotIdToDelete) {
          removeStorageWithLegacy(
            lastLotStorageKey,
            this.activeScopeType === "workspace" && this.activeWorkspaceId ? undefined : LEGACY_KEYS.LAST_LOT_ID
          );
        }
        this.saveLotsToStorage();
        this.currentLotId = null;
        this.notify("Lot deleted", "info");
        void this.pushCloudSync(true, {
          allowEmptyOverwrite: this.lots.length === 0
        });
      }
    );
  }
};

