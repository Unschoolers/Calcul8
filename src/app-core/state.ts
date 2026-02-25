import { DEFAULT_VALUES } from "../constants.ts";
import {
  getLegacyStorageKeys,
  migrateLegacyStorageKeys,
  readStorageWithLegacy,
  STORAGE_KEYS
} from "./storageKeys.ts";
import type { AppState } from "../types/app.ts";

function getLocalTodayDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createInitialState(): AppState {
  migrateLegacyStorageKeys();
  const legacyKeys = getLegacyStorageKeys();
  const todayDate = getLocalTodayDate();
  const purchaseUiMode = localStorage.getItem(STORAGE_KEYS.PURCHASE_UI_MODE) === "expert" ? "expert" : "simple";
  const hasProAccess = readStorageWithLegacy(STORAGE_KEYS.PRO_ACCESS, legacyKeys.PRO_ACCESS) === "1";
  const showManualPurchaseVerify =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_SHOW_MANUAL_PURCHASE_VERIFY || "").toLowerCase() === "true";

  return {
    hasProAccess,
    showManualPurchaseVerify,
    showVerifyPurchaseModal: false,
    showPortfolioReportModal: false,
    isVerifyingPurchase: false,
    purchaseTokenInput: "",
    purchaseProductIdInput: "",
    purchasePackageNameInput: "",
    purchaseUiMode,
    // UI State
    currentTab: "config",
    showNewLotModal: false,
    showRenameLotModal: false,
    speedDialOpenSales: false,
    snackbar: {
      show: false,
      text: "",
      color: "info"
    },
    isOffline: !navigator.onLine,
    deferredInstallPrompt: null,
    showInstallPrompt: false,
    googleAuthEpoch: 0,
    googleAvatarLoadFailed: false,
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
    spotsPerBox: DEFAULT_VALUES.SPOTS_PER_BOX,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
    purchaseDate: todayDate,
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
    targetProfitPercent: hasProAccess ? 15 : 0,
    showProfitCalculator: false,

    // Sales tracking
    sales: [],
    showAddSaleModal: false,
    editingSale: null,
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      memo: "",
      buyerShipping: DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
      date: todayDate
    },

    salesChart: null,
    chartView: "pie",
    portfolioChart: null,
    portfolioChartView: "trend",
    portfolioLotFilterIds: [],

    // Presets
    lots: [],
    singlesPurchases: [],
    showSinglesCsvMapperModal: false,
    singlesCsvImportHeaders: [],
    singlesCsvImportRows: [],
    singlesCsvImportCurrency: "CAD",
    singlesCsvImportMode: "merge",
    singlesCsvMapItem: null,
    singlesCsvMapCardNumber: null,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: null,
    singlesCsvMapMarketValue: null,
    currentLotId: null,
    newLotName: "",
    renameLotName: "",
    newLotType: "bulk",

    // Exchange Rate Cache
    lastFetchTime: null,
    cloudSyncIntervalId: null,
    lastSyncedPayloadHash: null,
    syncStatus: "idle",
    syncStatusResetTimeoutId: null,
    offlineReconnectIntervalId: null
  };
}

