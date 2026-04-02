import type { Lot, LotSetup, SinglesCatalogSource, SinglesPurchaseEntry } from "../../types/app.ts";
import {
  buildSinglesCsvImportDraft,
} from "./config-lots-import.ts";
import {
  getLegacySalesStorageKey,
  getLegacyStorageKeys,
  getScopedLastLotStorageKey,
  readStorageWithLegacy,
  removeStorageWithLegacy
} from "../storageKeys.ts";
import { normalizeSinglesCatalogSource } from "../shared/singles-catalog-source.ts";
import { type ConfigMethodSubset, getTodayDate } from "./config-shared.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import {
  canUseAuthoritativeSalesLiveApi,
  fetchAuthoritativeLivePricing,
  fetchAuthoritativeSales,
  SalesLiveApiError
} from "./sales-live-api.ts";
import { markLivePricingPollingBaseline } from "./ui/lot-entity-polling.ts";
import { queueWorkspaceConfigSyncPush } from "./ui/workspace-config-sync.ts";
import {
  normalizeSinglesPurchaseEntries,
  resetSinglesCsvImportState,
  resolveCurrentLot
} from "./config-lots-state.ts";
import {
  createNewLotRecord,
  normalizeSelectedLotId,
  validateRenameLotName
} from "./config-lot-crud.ts";
import {
  appendBlankSinglesPurchaseRow,
  beginSinglesCsvImport,
  confirmSinglesCsvImport,
  removeSinglesPurchaseRowById,
  syncSinglesPurchaseRows
} from "./config-lots-singles.ts";
import { applyHydratedLotState, buildHydratedLotState } from "./config-lot-loading.ts";
import {
  applyAuthoritativeLivePricingSnapshot,
  queueAuthoritativeLivePricingSave,
  resetAuthoritativeLivePricingState
} from "./config-live-pricing.ts";
import { deleteCurrentLotWithPersistence } from "./config-lot-delete.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

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
      feeProfilePreset: this.feeProfilePreset,
      platformFeePercent: this.platformFeePercent,
      additionalFeePercent: this.additionalFeePercent,
      additionalFeeAppliesTo: this.additionalFeeAppliesTo,
      fixedFeePerOrder: this.fixedFeePerOrder,
      includeTax: this.includeTax,
      externalSku: typeof this.externalSku === "string" ? this.externalSku.trim() : "",
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
    this.singlesPurchases = appendBlankSinglesPurchaseRow(
      this.singlesPurchases,
      this.currency === "USD" ? "USD" : "CAD"
    );
    this.onSinglesPurchaseRowsChange();
  },

  removeSinglesPurchaseRow(rowId: number): void {
    if (this.currentLotType !== "singles") return;

    this.singlesPurchases = removeSinglesPurchaseRowById(this.singlesPurchases, rowId);
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
    syncSinglesPurchaseRows(this);
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

            if (!beginSinglesCsvImport(this, raw)) {
              this.notify("No valid rows found in CSV.", "warning");
            }
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

    const result = confirmSinglesCsvImport(this);
    if (!result.ok) {
      if (result.message) {
        this.notify(result.message, "warning");
      }
      return;
    }

    this.notify(result.message ?? "Imported singles purchases from CSV.", "success");
  },

  cancelSinglesPurchasesCsvImport(): void {
    resetSinglesCsvImportState(this, this.currency === "USD" ? "USD" : "CAD");
  },

  createNewLot(): void {
    const name = (this.newLotName || "").trim();
    if (!name) return this.notify("Please enter a lot name", "warning");
    if (this.lots.some((p) => p.name === name)) return this.notify("A lot with this name already exists", "warning");

    const { lot: newLot, nextLotType, nextLotCatalogSource } = createNewLotRecord({
      lots: this.lots,
      currentLotId: this.currentLotId,
      newLotName: name,
      newLotType: this.newLotType === "singles" ? "singles" : "bulk",
      newLotCatalogSource: this.newLotCatalogSource,
      purchaseUiMode: this.purchaseUiMode,
      setup: this.getCurrentSetup(),
      todayDate: getTodayDate()
    });
    this.lots.push(newLot);
    this.saveLotsToStorage();

    this.currentLotId = newLot.id;
    this.loadLot();
    queueWorkspaceConfigSyncPush(this);
    this.newLotName = "";
    this.newLotType = nextLotType;
    this.newLotCatalogSource = nextLotCatalogSource;
    this.showNewLotModal = false;
    if (typeof this.handleGuidedOnboardingLotCreated === "function") {
      this.handleGuidedOnboardingLotCreated(newLot.lotType === "singles" ? "singles" : "bulk", newLot.id);
    }
    this.notify("Lot created", "success");
  },

  selectLot(lotId: number | null): void {
    const nextLotId = normalizeSelectedLotId(lotId);

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

    const renameResult = validateRenameLotName(this.lots, lot, this.renameLotName);
    if (!renameResult.ok) {
      this.notify(renameResult.message, "warning");
      return;
    }

    if (!renameResult.changed) {
      this.showRenameLotModal = false;
      return;
    }

    lot.name = renameResult.nextName;
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
    const todayDate = getTodayDate();
    const nextHydratedState = buildHydratedLotState(lot, {
      hasProAccess: this.hasProAccess,
      todayDate,
      currentNewLotCatalogSource: this.newLotCatalogSource
    });

    const hydrationRevision = (Number(this.lotHydrationRevision) || 0) + 1;
    this.lotHydrationRevision = hydrationRevision;
    this.isHydratingLotConfig = true;
    try {
      applyHydratedLotState(this, nextHydratedState);
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
            applyAuthoritativeLivePricingSnapshot(this, selectedLotId, latestLivePricing);
          } else {
            resetAuthoritativeLivePricingState(this);
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
    deleteCurrentLotWithPersistence(this, {
      readStorage: readStorageWithLegacy,
      removeStorage: removeStorageWithLegacy,
      getLegacySalesKey: getLegacySalesStorageKey,
      getLastLotStorageKey: getScopedLastLotStorageKey,
      getStorageScope: getActiveStorageScope,
      legacyKeys: {
        LAST_LOT_ID: LEGACY_KEYS.LAST_LOT_ID
      }
    });
    if (typeof this.syncGuidedOnboarding === "function") {
      this.syncGuidedOnboarding();
    }
  }
};

