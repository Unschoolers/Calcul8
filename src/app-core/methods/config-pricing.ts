import { DEFAULT_VALUES } from "../../constants.ts";
import type { ConfigPricingMethodImplementation } from "../context/commerce.ts";
import {
  calculateDefaultSellingPrices,
  calculatePriceForUnits as calculateUnitPrice,
  calculateProfitForListing
} from "../../domain/calculations.ts";
import type { FeeProfilePreset } from "../../types/app.ts";
import { getFeeProfilePreset } from "../shared/fee-profile-presets.ts";
import {
  applySystemPricingDefaultsToLot,
  lotUsesSystemPricingDefaults,
  normalizeSystemPricingDefaults,
  pickSystemPricingFieldsForLot
} from "../shared/system-pricing-defaults.ts";
import { getTodayDate, toDateOnly } from "./config-shared.ts";
import { queueWorkspaceConfigSyncPush } from "./ui/workspace/workspace-config-sync.ts";

export const configPricingMethods = {
  calculateProfit(units: number, pricePerUnit: number): number {
    return calculateProfitForListing(
      units,
      pricePerUnit,
      this.totalCaseCost,
      this.sellingTaxPercent,
      this.sellingShippingPerOrder,
      this
    );
  },

  recalculateDefaultPrices({ closeModal = false }: { closeModal?: boolean } = {}): void {
    const nextPrices = calculateDefaultSellingPrices({
      totalCaseCost: this.totalCaseCost,
      targetProfitPercent: this.targetProfitPercent,
      boxesPurchased: this.boxesPurchased,
      totalSpots: this.totalSpots,
      totalPacks: this.totalPacks,
      sellingTaxPercent: this.sellingTaxPercent,
      sellingShippingPerOrder: this.sellingShippingPerOrder,
      feeProfileInput: this
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
      this.notify("Pro access required to apply calculated prices", "warning");
      return;
    }
    if (this.currentLotType === "singles") {
      this.autoSaveSetup();
      this.applyLiveSinglesSuggestedPricing();
      this.showProfitCalculator = false;
      return;
    }
    this.recalculateDefaultPrices({ closeModal: true });
  },

  setFeeProfilePreset(preset: FeeProfilePreset): void {
    const feeProfile = getFeeProfilePreset(preset);
    this.feeProfilePreset = feeProfile.feeProfilePreset;
    this.platformFeePercent = feeProfile.platformFeePercent;
    this.additionalFeePercent = feeProfile.additionalFeePercent;
    this.additionalFeeAppliesTo = feeProfile.additionalFeeAppliesTo;
    this.fixedFeePerOrder = feeProfile.fixedFeePerOrder;
    this.recalculateDefaultPrices();
  },

  setSystemFeeProfilePreset(preset: FeeProfilePreset): void {
    const feeProfile = getFeeProfilePreset(preset);
    this.systemPricingDefaults = normalizeSystemPricingDefaults({
      ...this.systemPricingDefaults,
      ...feeProfile
    });
    this.onSystemPricingDefaultsChange();
  },

  onSystemPricingDefaultsChange(): void {
    const normalizedDefaults = normalizeSystemPricingDefaults(this.systemPricingDefaults);
    this.systemPricingDefaults = normalizedDefaults;

    this.lots = this.lots.map((lot) => applySystemPricingDefaultsToLot(lot, normalizedDefaults));

    const currentLot = this.currentLotId
      ? this.lots.find((lot) => lot.id === this.currentLotId)
      : null;
    if (currentLot && lotUsesSystemPricingDefaults(currentLot)) {
      Object.assign(this, pickSystemPricingFieldsForLot(currentLot, normalizedDefaults));
    }

    if (typeof this.saveSystemPricingDefaultsToStorage === "function") {
      this.saveSystemPricingDefaultsToStorage();
    }
    this.saveLotsToStorage();
    this.recalculateDefaultPrices();
    queueWorkspaceConfigSyncPush(this);
  },

  setCurrentLotSystemPricingDefaultsMode(useSystemDefaults: boolean): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }

    const lot = this.lots.find((candidate) => candidate.id === this.currentLotId);
    if (!lot) return;

    lot.usesSystemPricingDefaults = useSystemDefaults;
    if (useSystemDefaults) {
      const fields = pickSystemPricingFieldsForLot(lot, normalizeSystemPricingDefaults(this.systemPricingDefaults));
      Object.assign(lot, fields);
      Object.assign(this, fields);
    } else {
      Object.assign(lot, this.getCurrentSetup(), { usesSystemPricingDefaults: false });
    }

    this.saveLotsToStorage();
    this.recalculateDefaultPrices();
    queueWorkspaceConfigSyncPush(this);
  },

  updatePurchaseCostInput(value: number | string | null): void {
    const normalized = typeof value === "number" ? value : Number(value);
    this.purchaseCostInputValue = Number.isFinite(normalized) ? normalized : 0;
    this.onPurchaseConfigChange();
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
    if (this.spotsPerBox == null || Number.isNaN(Number(this.spotsPerBox)) || Number(this.spotsPerBox) <= 0) {
      this.spotsPerBox = DEFAULT_VALUES.SPOTS_PER_BOX;
    }
    this.recalculateDefaultPrices();
  },

  calculatePriceForUnits(units: number, targetNetRevenue: number): number {
    return calculateUnitPrice(units, targetNetRevenue, this.sellingTaxPercent, this.sellingShippingPerOrder, this);
  }
} satisfies ConfigPricingMethodImplementation;
