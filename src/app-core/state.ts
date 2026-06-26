import { DEFAULT_VALUES } from "../constants.ts";
import type { AppState } from "../types/app.ts";
import { primeStoredAuthSecretsFromStorage } from "./auth/index.ts";
import { getBrowserLocale, normalizeLanguagePreference } from "./i18n/index.ts";
import { getFeeProfilePreset } from "./shared/fee-profile-presets.ts";
import { resolveDefaultSinglesCatalogSourceFromEnv } from "./shared/singles-catalog-source.ts";
import { createDefaultSystemPricingDefaults } from "./shared/system-pricing-defaults.ts";
import { STORAGE_KEYS } from "./storageKeys.ts";

function getLocalTodayDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveSavedScope(): Pick<AppState, "activeScopeType" | "activeWorkspaceId"> {
  const rawScopeType = String(localStorage.getItem(STORAGE_KEYS.ACTIVE_SCOPE_TYPE) || "").trim().toLowerCase();
  const activeWorkspaceId = String(localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKSPACE_ID) || "").trim() || null;
  if (rawScopeType === "workspace" && activeWorkspaceId) {
    return {
      activeScopeType: "workspace",
      activeWorkspaceId
    };
  }
  return {
    activeScopeType: "personal",
    activeWorkspaceId: null
  };
}

export function createInitialState(): AppState {
  primeStoredAuthSecretsFromStorage();
  const todayDate = getLocalTodayDate();
  const hasProAccess = localStorage.getItem(STORAGE_KEYS.PRO_ACCESS) === "1";
  const preferredLanguage = normalizeLanguagePreference(localStorage.getItem(STORAGE_KEYS.LANGUAGE))
    || normalizeLanguagePreference(getBrowserLocale());
  const purchaseUiMode = hasProAccess && localStorage.getItem(STORAGE_KEYS.PURCHASE_UI_MODE) === "expert"
    ? "expert"
    : "simple";
  const savedScope = resolveSavedScope();
  const showManualPurchaseVerify =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_SHOW_MANUAL_PURCHASE_VERIFY || "").toLowerCase() === "true";
  const defaultFeeProfile = getFeeProfilePreset("whatnot");
  const systemPricingDefaults = createDefaultSystemPricingDefaults(hasProAccess ? 15 : 0);

  return {
    hasProAccess,
    preferredLanguage,
    guidedOnboardingStatus: "idle",
    guidedOnboardingLotType: null,
    guidedOnboardingTargetLotId: null,
    showManualPurchaseVerify,
    showVerifyPurchaseModal: false,
    showStripeCheckoutModal: false,
    showPortfolioReportModal: false,
    portfolioReportExpandedLotIds: [],
    isVerifyingPurchase: false,
    stripeCheckoutClientSecret: "",
    purchaseTokenInput: "",
    purchaseProductIdInput: "",
    purchasePackageNameInput: "",
    adminImportSourceUserId: "107850224060485991888",
    adminImportSourceWorkspaceId: "",
    isAdminImportInProgress: false,
    purchaseUiMode,
    activeScopeType: savedScope.activeScopeType,
    activeWorkspaceId: savedScope.activeWorkspaceId,
    availableWorkspaces: [],
    isWorkspaceLoading: false,
    showCreateWorkspaceModal: false,
    isCreatingWorkspace: false,
    newWorkspaceName: "",
    showWorkspaceMembersModal: false,
    workspaceMembers: [],
    workspacePresenceByUserId: {},
    isWorkspaceMembersLoading: false,
    isCreatingWorkspaceJoinLink: false,
    showLeaveWorkspaceModal: false,
    leaveWorkspaceTransferMemberUserId: "",
    leaveWorkspaceDeleteConfirmation: false,
    isLeavingWorkspace: false,
    pendingWorkspaceInviteToken: "",
    pendingWorkspaceInviteWorkspaceId: null,
    pendingWorkspaceInviteWorkspaceName: "",
    showWorkspaceJoinDialog: false,
    isResolvingWorkspaceInvite: false,
    isAcceptingWorkspaceInvite: false,
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
    isAuthSessionResolving: true,
    showGoogleSignInFallback: false,
    googleAuthEpoch: 0,
    googleAvatarLoadFailed: false,
    onlineListener: null,
    offlineListener: null,
    windowFocusListener: null,
    documentVisibilityListener: null,
    beforeInstallPromptListener: null,
    appInstalledListener: null,
    hasPwaUiHandlersBound: false,
    serviceWorkerLoadListener: null,
    serviceWorkerControllerChangeListener: null,
    serviceWorkerUpdateIntervalId: null,
    hasRegisteredServiceWorkerLifecycle: false,
    showAppUpdatePrompt: false,
    isApplyingAppUpdate: false,
    appUpdateWorker: null,
    confirmDialog: false,
    confirmTitle: "",
    confirmText: "",
    confirmColor: "error",
    confirmAction: null,
    showSystemConfigurationDialog: false,
    systemPricingDefaults,
    liveSinglesManualIds: [],
    liveSinglesExternalIds: [],

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
    feeProfilePreset: defaultFeeProfile.feeProfilePreset,
    platformFeePercent: defaultFeeProfile.platformFeePercent,
    additionalFeePercent: defaultFeeProfile.additionalFeePercent,
    additionalFeeAppliesTo: defaultFeeProfile.additionalFeeAppliesTo,
    fixedFeePerOrder: defaultFeeProfile.fixedFeePerOrder,
    includeTax: true,
    externalSku: "",

    // Default Selling Prices
    spotPrice: DEFAULT_VALUES.SPOT_PRICE,
    boxPriceSell: DEFAULT_VALUES.BOX_PRICE_SELL,
    packPrice: DEFAULT_VALUES.PACK_PRICE,
    liveSpotPrice: DEFAULT_VALUES.SPOT_PRICE,
    liveBoxPriceSell: DEFAULT_VALUES.BOX_PRICE_SELL,
    livePackPrice: DEFAULT_VALUES.PACK_PRICE,
    currentLivePricingVersion: null,
    livePricingHydrationStatus: "idle",
    livePricingHydratedLotId: null,

    // Auto-calculate profit
    targetProfitPercent: hasProAccess ? 15 : 0,
    showProfitCalculator: false,

    // Sales tracking
    sales: [],
    salesByLotId: new Map(),
    showAddSaleModal: false,
    editingSale: null,
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        {
          lineId: 1,
          singlesPurchaseEntryId: null,
          quantity: 1,
          price: null
        }
      ],
      price: 0,
      customer: "",
      memo: "",
      buyerShipping: DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
      date: todayDate
    },

    salesChart: null,
    chartView: "sparkline",
    portfolioChart: null,
    portfolioSalesByUserChart: null,
    lotSearchQuery: "",
    portfolioChartView: "trend",
    portfolioLotTypeFilter: "both",
    portfolioDashboardPreset: "all",
    portfolioLotFilterIds: [],
    portfolioSalesByUserMetric: "revenue",

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
    isHydratingLotConfig: false,
    lotHydrationRevision: 0,
    newLotName: "",
    renameLotName: "",
    newLotType: "bulk",
    newLotCatalogSource: resolveDefaultSinglesCatalogSourceFromEnv(),

    // Exchange Rate Cache
    lastFetchTime: null,
    cloudSyncIntervalId: null,
    lastSyncedPayloadHash: null,
    syncStatus: "idle",
    syncStatusResetTimeoutId: null,
    workspaceRealtimeStatus: "idle",
    offlineReconnectIntervalId: null,
    salesCacheEpoch: 0,
    whatnotConnectionStatus: "unconfigured",
    whatnotSyncStatus: "idle",
    whatnotConnectionSummary: null,
    showWhatnotReviewDialog: false,
    showWhatnotCsvImportDialog: false,
    whatnotCsvRawInput: "",
    whatnotCsvSellerAccountId: "",
    whatnotCsvHeaders: [],
    whatnotCsvRows: [],
    whatnotCsvMapExternalSaleId: null,
    whatnotCsvMapOrderId: null,
    whatnotCsvMapOrderItemId: null,
    whatnotCsvMapSellerAccountId: null,
    whatnotCsvMapTitle: null,
    whatnotCsvMapListingTitle: null,
    whatnotCsvMapBuyerName: null,
    whatnotCsvMapOrderPlacedAt: null,
    whatnotCsvMapOriginalItemPrice: null,
    whatnotCsvMapSku: null,
    whatnotCsvMapProductCategory: null,
    whatnotCsvMapQuantity: null,
    whatnotCsvMapPrice: null,
    whatnotCsvMapBuyerShipping: null,
    whatnotCsvMapDate: null,
    whatnotCsvMapOrderStatus: null,
    whatnotReviewBatchId: null,
    whatnotReviewRows: [],
    whatnotCallbackStatus: null,
    whatnotCallbackMessage: "",

    // Wheel
    wheelConfigs: [],
    activeWheelConfigId: null,
    wheelSpinning: false,
    wheelCurrentAngle: 0,
    wheelTotalSpins: 0,
    wheelSpinCounts: [],
    wheelLastResult: "",
    wheelSessionUpdatedAt: 0,
    wheelSessionLotSelections: {},
    wheelPendingInventoryIssues: [],
    wheelSkippedDeductions: [],
    wheelSessionNetRevenue: null,
    wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [],
    wheelChaseTallyHistory: [],
    wheelGridLayoutSeed: "",
    wheelGridReveals: [],
    wheelPreviewSpinCounts: [],
    wheelPreviewTotalSpins: 0,
    wheelPreviewFairnessHistory: [],
    wheelPreviewChaseTallyHistory: [],
    wheelPreviewGridLayoutSeed: "",
    wheelPreviewGridReveals: [],
    wheelLastResultColor: "rgb(var(--v-theme-primary))",
    wheelSpinHash: "",
    wheelSpinSeed: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: ""
  };
}
