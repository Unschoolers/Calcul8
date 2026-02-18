import { DEFAULT_VALUES } from "../../constants.ts";
import {
  calculateDefaultSellingPrices,
  calculatePriceForUnits as calculateUnitPrice,
  calculateProfitForListing
} from "../../domain/calculations.ts";
import { type ConfigMethodSubset, getTodayDate, toDateOnly } from "./config-shared.ts";

export const configPricingMethods: ConfigMethodSubset<
  | "calculateProfit"
  | "recalculateDefaultPrices"
  | "calculateOptimalPrices"
  | "onPurchaseConfigChange"
  | "calculatePriceForUnits"
> = {
  calculateProfit(units: number, pricePerUnit: number): number {
    return calculateProfitForListing(
      units,
      pricePerUnit,
      this.totalCaseCost,
      this.sellingTaxPercent,
      this.sellingShippingPerOrder
    );
  },

  recalculateDefaultPrices({ closeModal = false }: { closeModal?: boolean } = {}): void {
    const nextPrices = calculateDefaultSellingPrices({
      totalCaseCost: this.totalCaseCost,
      targetProfitPercent: this.targetProfitPercent,
      boxesPurchased: this.boxesPurchased,
      totalPacks: this.totalPacks,
      sellingTaxPercent: this.sellingTaxPercent,
      sellingShippingPerOrder: this.sellingShippingPerOrder
    });
    this.spotPrice = nextPrices.spotPrice;
    this.boxPriceSell = nextPrices.boxPriceSell;
    this.packPrice = nextPrices.packPrice;

    this.syncLivePricesFromDefaults();
    this.autoSaveSetup();
    if (closeModal) this.showProfitCalculator = false;
  },

  calculateOptimalPrices(): void {
    if (!this.canUsePaidActions) {
      this.notify("Pro access required to apply auto-calculated prices", "warning");
      return;
    }
    this.recalculateDefaultPrices({ closeModal: true });
  },

  onPurchaseConfigChange(): void {
    this.purchaseDate = toDateOnly(this.purchaseDate) ?? getTodayDate();
    if (this.purchaseShippingCost == null || Number.isNaN(Number(this.purchaseShippingCost))) {
      this.purchaseShippingCost = DEFAULT_VALUES.PURCHASE_SHIPPING_COST;
    }
    if (Number(this.purchaseShippingCost) < 0) {
      this.purchaseShippingCost = 0;
    }
    if (this.purchaseTaxPercent == null || Number.isNaN(Number(this.purchaseTaxPercent))) {
      this.purchaseTaxPercent = DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
    }
    if (Number(this.purchaseTaxPercent) < 0) {
      this.purchaseTaxPercent = 0;
    }
    if (this.sellingTaxPercent == null || Number.isNaN(Number(this.sellingTaxPercent))) {
      this.sellingTaxPercent = DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    }
    if (Number(this.sellingTaxPercent) < 0) {
      this.sellingTaxPercent = 0;
    }
    if (this.sellingShippingPerOrder == null || Number.isNaN(Number(this.sellingShippingPerOrder))) {
      this.sellingShippingPerOrder = DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER;
    }
    if (Number(this.sellingShippingPerOrder) < 0) {
      this.sellingShippingPerOrder = 0;
    }
    this.recalculateDefaultPrices();
  },

  calculatePriceForUnits(units: number, targetNetRevenue: number): number {
    return calculateUnitPrice(units, targetNetRevenue, this.sellingTaxPercent, this.sellingShippingPerOrder);
  }
};
