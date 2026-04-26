import type { Chart as ChartJS } from "chart.js";
import type {
  LuckGameType as SharedLuckGameType,
  WheelSpectatorChaseBoardEntry as SharedWheelSpectatorChaseBoardEntry,
  WheelSpectatorChaseHistoryEntry as SharedWheelSpectatorChaseHistoryEntry,
  WheelSpectatorFairnessEntry as SharedWheelSpectatorFairnessEntry,
  WheelSpectatorGridCell as SharedWheelSpectatorGridCell,
  WheelSpectatorHeatLevel as SharedWheelSpectatorHeatLevel,
  WheelSpectatorSessionStatus as SharedWheelSpectatorSessionStatus,
  WheelSpectatorSlot as SharedWheelSpectatorSlot,
  WheelSpectatorSnapshot as SharedWheelSpectatorSnapshot,
  WheelSpectatorSpinAnimation as SharedWheelSpectatorSpinAnimation
} from "../../shared/wheel-public-session-contracts";

export type AppTab = "config" | "live" | "sales" | "portfolio" | "wheel";
export type LotType = "bulk" | "singles";
export type GuidedOnboardingStatus = "idle" | "available" | "running" | "completed" | "dismissed";
export type SinglesCatalogSource = "ua" | "pokemon" | "none";
export type CostInputMode = "perBox" | "total";
export type PurchaseUiMode = "simple" | "expert";
export type CurrencyCode = "CAD" | "USD";
export type FeeProfilePreset = "whatnot" | "none";
export type AdditionalFeeAppliesTo = "sale_only" | "sale_plus_shipping";
export type SinglesCsvImportMode = "merge" | "sync" | "append";
export type SaleType = "pack" | "box" | "rtyh" | "wheel";
export type ChartViewMode = "pie" | "sparkline";
export type PortfolioChartViewMode = "breakdown" | "trend" | "sellthrough" | "margin";
export type PortfolioLotTypeFilter = "both" | "bulk" | "singles";
export type PortfolioSalesByUserMetric = "revenue" | "profit" | "count";
export type SyncStatus = "idle" | "syncing" | "success" | "error";
export type WorkspaceRealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
export type WorkspacePresenceState = "online" | "recent" | "offline";
export type LiveSinglesSelectionSource = "manual" | "external";
export type LiveSinglesSelectionMode = "replace" | "merge";
export type WorkspaceScopeType = "personal" | "workspace";
export type WorkspaceRole = "owner" | "member";
export type WhatnotConnectionStatus = "unconfigured" | "disconnected" | "connecting" | "connected" | "error";
export type WhatnotSyncStatus = "idle" | "syncing" | "success" | "error";
export type WhatnotSaleImportAction = "create" | "update" | "skip";
export type WhatnotMappedSaleType = "pack" | "box" | "rtyh" | "wheel";
export type WhatnotCsvImportSource = "csv";
export type WhatnotImportDecisionKind = "new" | "whatnot_mapping" | "manual_candidate";
export type WhatnotReviewImportAction = "create" | "update_existing" | "skip";
export type UiColor =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "primary"
  | "secondary"
  | "surface"
  | "grey"
  | string;

export interface SnackbarState {
  show: boolean;
  text: string;
  color: UiColor;
}

export interface WheelTier {
  id: string;
  label: string;
  color: string;
  chancePercent?: number;
  slots: number;
  costPerTier: number;
  packsCount: number;
  deductionType: "packs" | "singles" | "none";
  sets: string[];
  boundLotId?: number | null;
  boundSinglesId?: number | null;
  isChase?: boolean;
  celebrationEmoji?: string;
}

export type LuckGameType = SharedLuckGameType;

export interface WheelConfig {
  id: number;
  name: string;
  spinPrice: number;
  targetMargin: number;
  gameType?: LuckGameType;
  outcomeCount?: number;
  gridCellCount?: number;
  tiers: WheelTier[];
  createdAt: string;
  updatedAt?: string;
}

export interface MysteryGridReveal {
  cellIndex: number;
  slotIndex: number;
  label: string;
  color: string;
  tier: string;
  spinNumber: number;
  timestamp: number;
}

export interface PendingWheelInventoryIssue {
  slotName: string;
  slotColor: string;
  slotCost: number;
  slotTier: string;
  slotPacksCount: number;
  slotDeductionType: "packs" | "singles" | "none";
  slotIndex: number;
  selectedLotId: number | null;
  spinNumber: number;
  slotSinglesId?: number | null;
}

export interface WheelFairnessEntry {
  spinNumber: number;
  label: string;
  color: string;
  hash: string;
  seed: string;
  clientSeed?: string;
  layoutHash?: string;
  verificationUrl?: string;
  algorithm?: string;
  timestamp: number;
}

export type WheelSpectatorSessionStatus = SharedWheelSpectatorSessionStatus;
export type WheelSpectatorHeatLevel = SharedWheelSpectatorHeatLevel;
export type WheelSpectatorFairnessEntry = SharedWheelSpectatorFairnessEntry;
export type WheelSpectatorChaseHistoryEntry = SharedWheelSpectatorChaseHistoryEntry;
export type WheelSpectatorChaseBoardEntry = SharedWheelSpectatorChaseBoardEntry;
export type WheelSpectatorSlot = SharedWheelSpectatorSlot;
export type WheelSpectatorGridCell = SharedWheelSpectatorGridCell;
export type WheelSpectatorSpinAnimation = SharedWheelSpectatorSpinAnimation;
export type WheelSpectatorSnapshot = SharedWheelSpectatorSnapshot;

export interface NewSaleDraft {
  type: SaleType;
  quantity: number | null;
  packsCount: number | null;
  singlesPurchaseEntryId?: number | null;
  singlesItems?: SinglesSaleDraftLine[];
  price: number | null;
  customer?: string;
  memo?: string;
  buyerShipping: number;
  date: string;
}

export interface SinglesSaleDraftLine {
  lineId: number;
  singlesPurchaseEntryId: number | null;
  quantity: number | null;
  price: number | null;
}

export interface SinglesSaleLine {
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
}

export interface Sale {
  id: number;
  type: SaleType;
  quantity: number;
  packsCount: number;
  singlesPurchaseEntryId?: number;
  singlesItems?: SinglesSaleLine[];
  price: number;
  priceIsTotal?: boolean;
  customer?: string;
  memo?: string;
  buyerShipping: number;
  date: string;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  mutationId?: string;
  linkedWheelId?: number;
  winningTierId?: string;
  costOfWinningTier?: number;
  netRevenue?: number;
}

export interface LotSalesCacheEntry {
  status: "missing" | "loaded";
  sales: Sale[];
}

export interface LotSalesSyncMeta {
  activeCount: number;
  latestUpdatedAt: string | null;
}

export interface SinglesSaleCardOption {
  title: string;
  value: number;
  item: string;
  cardNumber: string;
  image?: string;
  cost: number;
  marketValue: number;
  quantity: number;
  costBasis: number;
  profitablePrice: number;
  soldCount: number;
}

export interface SinglesPurchaseEntry {
  id: number;
  item: string;
  cardNumber?: string;
  externalSku?: string;
  image?: string;
  condition?: string;
  language?: string;
  cost: number;
  currency?: CurrencyCode;
  quantity: number;
  marketValue: number;
  marketValueCurrency?: CurrencyCode;
}

export interface SinglesCsvColumnMapping {
  item: number | null;
  cardNumber: number | null;
  condition: number | null;
  language: number | null;
  cost: number | null;
  quantity: number | null;
  marketValue: number | null;
}

export interface FeeProfileFields {
  feeProfilePreset: FeeProfilePreset;
  platformFeePercent: number;
  additionalFeePercent: number;
  additionalFeeAppliesTo: AdditionalFeeAppliesTo;
  fixedFeePerOrder: number;
}

export interface LotSetup extends FeeProfileFields {
  boxPriceCost: number;
  boxesPurchased: number;
  packsPerBox: number;
  spotsPerBox?: number;
  costInputMode: CostInputMode;
  currency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  purchaseDate: string;
  purchaseShippingCost: number;
  purchaseTaxPercent: number;
  sellingTaxPercent: number;
  sellingShippingPerOrder: number;
  includeTax: boolean;
  externalSku?: string;
  spotPrice: number;
  boxPriceSell: number;
  packPrice: number;
  targetProfitPercent: number;
}

export interface Lot extends LotSetup {
  id: number;
  name: string;
  isComplete?: boolean;
  lotType?: LotType;
  singlesCatalogSource?: SinglesCatalogSource;
  singlesPurchases?: SinglesPurchaseEntry[];
  createdAt?: string;
  taxRatePercent?: number;
}

export interface SalesStatus {
  color: UiColor;
  icon: string;
  title: string;
  profit: number;
  revenue: number;
}

export interface LotPerformanceSummary {
  lotId: number;
  lotName: string;
  salesCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number | null;
  realizedCost?: number;
  realizedProfit?: number;
  realizedMarginPercent?: number | null;
  soldPacks: number;
  totalPacks: number;
  lastSaleDate: string | null;
}

export interface PortfolioTotals {
  lotCount: number;
  profitableLotCount: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
}

export interface PortfolioSalesByUserWeekBucket {
  key: string;
  label: string;
}

export interface PortfolioSalesByUserSeries {
  key: string;
  label: string;
  values: number[];
  total: number;
  color: string;
}

export interface PortfolioSalesByUserChartData {
  weeks: PortfolioSalesByUserWeekBucket[];
  series: PortfolioSalesByUserSeries[];
}

export interface WorkspaceSummary {
  workspaceId: string;
  name: string;
  role: WorkspaceRole;
  status: "active";
}

export interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: "active" | "disabled" | "removed";
  updatedAt: string;
  displayName?: string;
  photoUrl?: string;
}

export interface WorkspacePresenceEntry {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string;
}

export interface WhatnotConnectionSummary {
  configured: boolean;
  connected: boolean;
  displayName: string;
  externalAccountId: string;
  scopes: string[];
  lastSyncedAt: string | null;
  pendingReviewCount: number;
  pendingBatchId: string | null;
}

export interface WhatnotManualDuplicateSaleSummary {
  date: string;
  price: number;
  quantity: number;
  packsCount: number;
  customer?: string;
  memo?: string;
}

export interface WhatnotManualDuplicateCandidate {
  saleId: string;
  confidence: "high" | "medium";
  reasonSummary: string;
  saleSummary: WhatnotManualDuplicateSaleSummary;
}

export interface WhatnotImportReviewRow {
  rowId: string;
  externalSaleId: string;
  externalOrderId: string;
  externalOrderItemId: string;
  externalAccountId: string;
  title: string;
  listingTitle?: string;
  sku?: string;
  productCategory?: string;
  buyerName?: string;
  quantity: number;
  price: number;
  originalItemPrice?: number;
  buyerShipping: number;
  date: string;
  orderPlacedAt?: string;
  orderPlacedAtRaw?: string;
  orderStatus: string;
  listingId?: string;
  productId?: string;
  variantId?: string;
  action: WhatnotSaleImportAction;
  suggestedLotId?: number;
  suggestedSaleType?: WhatnotMappedSaleType;
  suggestedPacksCount?: number;
  matchSource: "remembered" | "title" | "none";
  existingSaleId?: string;
  requiresManualReview: boolean;
  selectedLotId: number | null;
  selectedSaleType: WhatnotMappedSaleType | null;
  selectedPacksCount: number | null;
  selectedImportAction?: WhatnotReviewImportAction;
  targetKind?: WhatnotImportDecisionKind | null;
  targetSaleId?: string | null;
  manualDuplicateCandidate?: WhatnotManualDuplicateCandidate | null;
  skipImport: boolean;
}

export interface WhatnotCsvColumnMapping {
  orderId: number | null;
  orderItemId: number | null;
  sellerAccountId: number | null;
  title: number | null;
  sku: number | null;
  quantity: number | null;
  price: number | null;
  buyerShipping: number | null;
  date: number | null;
  orderStatus: number | null;
}

export interface WhatnotCsvImportDraft {
  headers: string[];
  rows: string[][];
  mapping: WhatnotCsvColumnMapping;
}

export interface WhatnotCsvPreparedRowInput {
  source: WhatnotCsvImportSource;
  externalOrderId: string;
  externalOrderItemId?: string;
  externalSaleId?: string;
  externalAccountId?: string;
  title: string;
  listingTitle?: string;
  sku?: string;
  productCategory?: string;
  buyerName?: string;
  quantity: number;
  price: number;
  originalItemPrice?: number;
  buyerShipping: number;
  date: string;
  orderPlacedAt?: string;
  orderPlacedAtRaw?: string;
  orderStatus?: string;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface AppState extends LotSetup {
  hasProAccess: boolean;
  preferredLanguage: string;
  guidedOnboardingStatus: GuidedOnboardingStatus;
  guidedOnboardingLotType: LotType | null;
  guidedOnboardingTargetLotId: number | null;
  showManualPurchaseVerify: boolean;
  showVerifyPurchaseModal: boolean;
  showStripeCheckoutModal: boolean;
  showPortfolioReportModal: boolean;
  portfolioReportExpandedLotIds: number[];
  isVerifyingPurchase: boolean;
  stripeCheckoutClientSecret: string;
  purchaseTokenInput: string;
  purchaseProductIdInput: string;
  purchasePackageNameInput: string;
  adminImportSourceUserId: string;
  isAdminImportInProgress: boolean;
  purchaseUiMode: PurchaseUiMode;
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
  availableWorkspaces: WorkspaceSummary[];
  isWorkspaceLoading: boolean;
  showCreateWorkspaceModal: boolean;
  isCreatingWorkspace: boolean;
  newWorkspaceName: string;
  showWorkspaceMembersModal: boolean;
  workspaceMembers: WorkspaceMember[];
  workspacePresenceByUserId: Record<string, WorkspacePresenceEntry>;
  isWorkspaceMembersLoading: boolean;
  isCreatingWorkspaceJoinLink: boolean;
  showLeaveWorkspaceModal: boolean;
  leaveWorkspaceTransferMemberUserId: string;
  leaveWorkspaceDeleteConfirmation: boolean;
  isLeavingWorkspace: boolean;
  pendingWorkspaceInviteToken: string;
  pendingWorkspaceInviteWorkspaceId: string | null;
  pendingWorkspaceInviteWorkspaceName: string;
  showWorkspaceJoinDialog: boolean;
  isResolvingWorkspaceInvite: boolean;
  isAcceptingWorkspaceInvite: boolean;
  currentTab: AppTab;
  showNewLotModal: boolean;
  showRenameLotModal: boolean;
  speedDialOpenSales: boolean;
  snackbar: SnackbarState;
  isOffline: boolean;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  showInstallPrompt: boolean;
  showGoogleSignInFallback: boolean;
  googleAuthEpoch: number;
  googleAvatarLoadFailed: boolean;
  onlineListener: (() => void) | null;
  offlineListener: (() => void) | null;
  windowFocusListener: (() => void) | null;
  documentVisibilityListener: (() => void) | null;
  beforeInstallPromptListener: ((event: Event) => void) | null;
  appInstalledListener: (() => void) | null;
  hasPwaUiHandlersBound: boolean;
  serviceWorkerLoadListener: (() => void) | null;
  serviceWorkerControllerChangeListener: (() => void) | null;
  serviceWorkerUpdateIntervalId: number | null;
  hasRegisteredServiceWorkerLifecycle: boolean;
  showAppUpdatePrompt: boolean;
  isApplyingAppUpdate: boolean;
  appUpdateWorker: ServiceWorker | null;
  confirmDialog: boolean;
  confirmTitle: string;
  confirmText: string;
  confirmColor: UiColor;
  confirmAction: (() => void) | null;
  liveSinglesManualIds: number[];
  liveSinglesExternalIds: number[];
  liveSpotPrice: number;
  liveBoxPriceSell: number;
  livePackPrice: number;
  currentLivePricingVersion: number | null;
  showProfitCalculator: boolean;
  sales: Sale[];
  salesByLotId: Map<number, Sale[]>;
  showAddSaleModal: boolean;
  editingSale: Sale | null;
  newSale: NewSaleDraft;
  salesChart: ChartJS | null;
  chartView: ChartViewMode;
  portfolioChart: ChartJS | null;
  portfolioSalesByUserChart: ChartJS | null;
  portfolioChartView: PortfolioChartViewMode;
  portfolioLotTypeFilter: PortfolioLotTypeFilter;
  portfolioLotFilterIds: number[];
  portfolioSalesByUserMetric: PortfolioSalesByUserMetric;
  lotSearchQuery: string;
  lots: Lot[];
  singlesPurchases: SinglesPurchaseEntry[];
  showSinglesCsvMapperModal: boolean;
  singlesCsvImportHeaders: string[];
  singlesCsvImportRows: string[][];
  singlesCsvImportCurrency: CurrencyCode;
  singlesCsvImportMode: SinglesCsvImportMode;
  singlesCsvMapItem: number | null;
  singlesCsvMapCardNumber: number | null;
  singlesCsvMapCondition: number | null;
  singlesCsvMapLanguage: number | null;
  singlesCsvMapCost: number | null;
  singlesCsvMapQuantity: number | null;
  singlesCsvMapMarketValue: number | null;
  currentLotId: number | null;
  isHydratingLotConfig: boolean;
  lotHydrationRevision: number;
  newLotName: string;
  renameLotName: string;
  newLotType: LotType;
  newLotCatalogSource: SinglesCatalogSource;
  lastFetchTime: number | null;
  cloudSyncIntervalId: number | null;
  lastSyncedPayloadHash: string | null;
  syncStatus: SyncStatus;
  syncStatusResetTimeoutId: number | null;
  workspaceRealtimeStatus: WorkspaceRealtimeStatus;
  offlineReconnectIntervalId: number | null;
  salesCacheEpoch: number;
  whatnotConnectionStatus: WhatnotConnectionStatus;
  whatnotSyncStatus: WhatnotSyncStatus;
  whatnotConnectionSummary: WhatnotConnectionSummary | null;
  showWhatnotReviewDialog: boolean;
  showWhatnotCsvImportDialog: boolean;
  whatnotCsvRawInput: string;
  whatnotCsvSellerAccountId: string;
  whatnotCsvHeaders: string[];
  whatnotCsvRows: string[][];
  whatnotCsvMapExternalSaleId: number | null;
  whatnotCsvMapOrderId: number | null;
  whatnotCsvMapOrderItemId: number | null;
  whatnotCsvMapSellerAccountId: number | null;
  whatnotCsvMapTitle: number | null;
  whatnotCsvMapListingTitle: number | null;
  whatnotCsvMapBuyerName: number | null;
  whatnotCsvMapOrderPlacedAt: number | null;
  whatnotCsvMapOriginalItemPrice: number | null;
  whatnotCsvMapSku: number | null;
  whatnotCsvMapProductCategory: number | null;
  whatnotCsvMapQuantity: number | null;
  whatnotCsvMapPrice: number | null;
  whatnotCsvMapBuyerShipping: number | null;
  whatnotCsvMapDate: number | null;
  whatnotCsvMapOrderStatus: number | null;
  whatnotReviewBatchId: string | null;
  whatnotReviewRows: WhatnotImportReviewRow[];
  whatnotCallbackStatus: "connected" | "error" | null;
  whatnotCallbackMessage: string;

  // Wheel
  wheelConfigs: WheelConfig[];
  activeWheelConfigId: number | null;
  wheelSpinning: boolean;
  wheelCurrentAngle: number;
  wheelTotalSpins: number;
  wheelSpinCounts: number[];
  wheelLastResult: string;
  wheelSessionUpdatedAt: number;
  wheelSessionLotSelections: Record<string, number | null>;
  wheelPendingInventoryIssues: PendingWheelInventoryIssue[];
  wheelSkippedDeductions: PendingWheelInventoryIssue[];
  wheelSessionNetRevenue: number | null;
  wheelSessionCostAdjustment: number;
  wheelFairnessHistory: WheelFairnessEntry[];
  wheelChaseTallyHistory: Array<{ tierId: string; label: string; color: string; count: number }>;
  wheelGridReveals: MysteryGridReveal[];
  wheelPreviewSpinCounts: number[];
  wheelPreviewTotalSpins: number;
  wheelPreviewFairnessHistory: WheelFairnessEntry[];
  wheelPreviewChaseTallyHistory: Array<{ tierId: string; label: string; color: string; count: number }>;
  wheelPreviewGridReveals: MysteryGridReveal[];
  wheelLastResultColor: string;
  wheelSpinHash: string;
  wheelSpinSeed: string;
  wheelSpinClientSeed: string;
  wheelSpinVerificationUrl: string;
  wheelSpinAlgorithm: string;
}
