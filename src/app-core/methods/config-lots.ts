import { DEFAULT_VALUES } from "../../constants.ts";
import type { PresetSetup } from "../../types/app.ts";
import {
  getLegacySalesStorageKey,
  getLegacyStorageKeys,
  readStorageWithLegacy,
  removeStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";
import { type ConfigMethodSubset, getTodayDate, inferDateFromPresetId, toDateOnly } from "./config-shared.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

export const configLotMethods: ConfigMethodSubset<
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "createNewLot"
  | "createNewPreset"
  | "loadLot"
  | "loadPreset"
  | "deleteCurrentLot"
  | "deleteCurrentPreset"
> = {
  getCurrentSetup(): PresetSetup {
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
    if (!this.currentPresetId) return;
    const preset = this.presets.find((p) => p.id === this.currentPresetId);
    if (!preset) return;

    Object.assign(preset, this.getCurrentSetup());
    this.savePresetsToStorage();
  },

  syncLivePricesFromDefaults(): void {
    this.liveSpotPrice = this.spotPrice;
    this.liveBoxPriceSell = this.boxPriceSell;
    this.livePackPrice = this.packPrice;
  },

  resetLivePrices(): void {
    this.syncLivePricesFromDefaults();
    this.notify("Live prices reset to config defaults", "info");
  },

  applyLivePricesToDefaults(): void {
    if (!this.currentPresetId) {
      this.notify("Select a lot first", "warning");
      return;
    }

    this.spotPrice = Number(this.liveSpotPrice) || 0;
    this.boxPriceSell = Number(this.liveBoxPriceSell) || 0;
    this.packPrice = Number(this.livePackPrice) || 0;
    this.autoSaveSetup();
    this.notify("Live prices saved to config", "success");
  },

  createNewLot(): void {
    this.createNewPreset();
  },

  createNewPreset(): void {
    const name = (this.newPresetName || "").trim();
    if (!name) return this.notify("Please enter a lot name", "warning");
    if (this.presets.some((p) => p.name === name)) return this.notify("A lot with this name already exists", "warning");

    const todayDate = getTodayDate();
    const setup = this.getCurrentSetup();
    const selectedPreset = this.currentPresetId ? this.presets.find((p) => p.id === this.currentPresetId) : null;
    const fallbackPreviousPreset = this.presets.length > 0 ? this.presets[this.presets.length - 1] : null;
    const previousSellingTaxRaw =
      selectedPreset?.sellingTaxPercent ??
      fallbackPreviousPreset?.sellingTaxPercent ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    const previousSellingTax = Number(previousSellingTaxRaw);
    setup.sellingTaxPercent =
      Number.isFinite(previousSellingTax) && previousSellingTax >= 0
        ? previousSellingTax
        : DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;

    if (this.purchaseUiMode === "simple") {
      setup.purchaseDate = todayDate;
      setup.purchaseShippingCost = 0;
      setup.purchaseTaxPercent = 0;
    }

    const newPreset = {
      id: Date.now(),
      name,
      createdAt: todayDate,
      ...setup
    };
    this.presets.push(newPreset);
    this.savePresetsToStorage();

    this.currentPresetId = newPreset.id;
    this.loadPreset();
    this.newPresetName = "";
    this.showNewPresetModal = false;
    this.notify("Lot created", "success");
  },

  loadLot(): void {
    this.loadPreset();
  },

  loadPreset(): void {
    if (!this.currentPresetId) return;

    const preset = this.presets.find((p) => p.id === this.currentPresetId);
    if (!preset) return;
    const todayDate = getTodayDate();

    this.boxPriceCost = preset.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE;
    this.boxesPurchased = preset.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED;
    this.packsPerBox = preset.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX;
    this.spotsPerBox = preset.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX;
    this.costInputMode = preset.costInputMode ?? "perBox";
    this.currency = preset.currency ?? "CAD";
    this.sellingCurrency = preset.sellingCurrency ?? "CAD";
    this.exchangeRate = preset.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE;
    this.purchaseDate =
      toDateOnly(preset.purchaseDate) ??
      toDateOnly(preset.createdAt) ??
      inferDateFromPresetId(preset.id) ??
      todayDate;
    this.purchaseShippingCost = preset.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST;

    const legacyTax = preset.taxRatePercent;
    this.purchaseTaxPercent =
      preset.purchaseTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
    this.sellingTaxPercent =
      preset.sellingTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    this.sellingShippingPerOrder = preset.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER;
    this.includeTax = preset.includeTax ?? true;
    this.spotPrice = preset.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE;
    this.boxPriceSell = preset.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL;
    this.packPrice = preset.packPrice ?? DEFAULT_VALUES.PACK_PRICE;
    const parsedTargetProfit = Number(preset.targetProfitPercent);
    if (!this.hasProAccess) {
      this.targetProfitPercent = 0;
    } else if (Number.isFinite(parsedTargetProfit) && parsedTargetProfit >= 0) {
      this.targetProfitPercent = parsedTargetProfit;
    } else {
      this.targetProfitPercent = 15;
    }

    this.syncLivePricesFromDefaults();
    this.loadSalesFromStorage();
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
    this.deleteCurrentPreset();
  },

  deleteCurrentPreset(): void {
    if (!this.currentPresetId) return;
    const preset = this.presets.find((p) => p.id === this.currentPresetId);
    if (!preset) return;
    const presetIdToDelete = preset.id;
    const linkedSalesCount = this.loadSalesForPresetId(presetIdToDelete).length;

    this.askConfirmation(
      {
        title: "Delete Lot?",
        text: linkedSalesCount > 0
          ? `Delete "${preset.name}" and ${linkedSalesCount} linked sale${linkedSalesCount === 1 ? "" : "s"} permanently?`
          : `Delete "${preset.name}" permanently?`,
        color: "error"
      },
      () => {
        this.presets = this.presets.filter((p) => p.id !== presetIdToDelete);
        removeStorageWithLegacy(
          this.getSalesStorageKey(presetIdToDelete),
          getLegacySalesStorageKey(presetIdToDelete)
        );
        if (Number(readStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID)) === presetIdToDelete) {
          removeStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID);
        }
        this.savePresetsToStorage();
        this.currentPresetId = null;
        this.notify("Lot deleted", "info");
      }
    );
  }
};
