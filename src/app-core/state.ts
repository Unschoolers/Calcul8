import { DEFAULT_VALUES } from "../constants.ts";
import type { AppState } from "../types/app.ts";

export function createInitialState(): AppState {
  return {
    // UI State
    currentTab: "config",
    showNewPresetModal: false,
    speedDialOpen: false,
    speedDialOpenSales: false,
    snackbar: {
      show: false,
      text: "",
      color: "info"
    },
    isOffline: !navigator.onLine,
    deferredInstallPrompt: null,
    showInstallPrompt: false,
    onlineListener: null,
    offlineListener: null,
    beforeInstallPromptListener: null,
    appInstalledListener: null,
    confirmDialog: false,
    confirmTitle: "",
    confirmText: "",
    confirmColor: "error",
    confirmAction: null,

    // Pricing Configuration
    boxPriceCost: DEFAULT_VALUES.BOX_PRICE,
    boxesPurchased: DEFAULT_VALUES.BOXES_PURCHASED,
    packsPerBox: DEFAULT_VALUES.PACKS_PER_BOX,
    costInputMode: "perBox",
    currency: "CAD",
    exchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
    purchaseShippingCost: DEFAULT_VALUES.PURCHASE_SHIPPING_COST,
    purchaseTaxPercent: DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT,
    sellingTaxPercent: DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT,
    sellingShippingPerOrder: DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
    includeTax: true,

    // Default Selling Prices
    spotPrice: DEFAULT_VALUES.SPOT_PRICE,
    boxPriceSell: DEFAULT_VALUES.BOX_PRICE_SELL,
    packPrice: DEFAULT_VALUES.PACK_PRICE,
    liveSpotPrice: DEFAULT_VALUES.SPOT_PRICE,
    liveBoxPriceSell: DEFAULT_VALUES.BOX_PRICE_SELL,
    livePackPrice: DEFAULT_VALUES.PACK_PRICE,

    // Auto-calculate profit
    targetProfitPercent: 15,
    showProfitCalculator: false,

    // Sales tracking
    sales: [],
    showAddSaleModal: false,
    editingSale: null,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 0,
      buyerShipping: DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
      date: new Date().toISOString().split("T")[0]
    },

    salesChart: null,
    chartView: "pie",

    // Presets
    presets: [],
    currentPresetId: null,
    newPresetName: "",

    // Exchange Rate Cache
    lastFetchTime: null
  };
}
