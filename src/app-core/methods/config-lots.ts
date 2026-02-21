import { DEFAULT_VALUES } from "../../constants.ts";
import type { LotSetup } from "../../types/app.ts";
import {
  getLegacySalesStorageKey,
  getLegacyStorageKeys,
  readStorageWithLegacy,
  removeStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";
import { type ConfigMethodSubset, getTodayDate, inferDateFromLotId, toDateOnly } from "./config-shared.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

export const configLotMethods: ConfigMethodSubset<
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "createNewLot"
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
    if (!this.currentLotId) {
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
    const name = (this.newLotName || "").trim();
    if (!name) return this.notify("Please enter a lot name", "warning");
    if (this.lots.some((p) => p.name === name)) return this.notify("A lot with this name already exists", "warning");

    const todayDate = getTodayDate();
    const setup = this.getCurrentSetup();
    const selectedLot = this.currentLotId ? this.lots.find((p) => p.id === this.currentLotId) : null;
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

    const newLot = {
      id: Date.now(),
      name,
      createdAt: todayDate,
      ...setup
    };
    this.lots.push(newLot);
    this.saveLotsToStorage();

    this.currentLotId = newLot.id;
    this.loadLot();
    this.newLotName = "";
    this.showNewLotModal = false;
    this.notify("Lot created", "success");
  },

  loadLot(): void {
    if (!this.currentLotId) return;

    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    const todayDate = getTodayDate();

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
    const parsedTargetProfit = Number(lot.targetProfitPercent);
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
        if (Number(readStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID)) === lotIdToDelete) {
          removeStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID);
        }
        this.saveLotsToStorage();
        this.currentLotId = null;
        this.notify("Lot deleted", "info");
      }
    );
  }
};
