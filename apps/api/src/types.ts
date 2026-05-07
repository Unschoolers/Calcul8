import type {
    SyncAdditionalFeeAppliesTo as SharedSyncAdditionalFeeAppliesTo,
    SyncCostInputMode as SharedSyncCostInputMode,
    SyncCurrencyCode as SharedSyncCurrencyCode,
    SyncEntityRecord as SharedSyncEntityRecord,
    SyncFeeProfilePreset as SharedSyncFeeProfilePreset,
    SyncGameFairnessEntryDto as SharedSyncGameFairnessEntryDto,
    SyncGameSessionDto as SharedSyncGameSessionDto,
    SyncGameTallyEntryDto as SharedSyncGameTallyEntryDto,
    SyncInventoryIssueDto as SharedSyncInventoryIssueDto,
    SyncLivePricingDto as SharedSyncLivePricingDto,
    SyncLotDto as SharedSyncLotDto,
    SyncLotType as SharedSyncLotType,
    SyncMetadataDto as SharedSyncMetadataDto,
    SyncPayloadDto as SharedSyncPayloadDto,
    SyncSaleDto as SharedSyncSaleDto,
    SyncSaleLineDto as SharedSyncSaleLineDto,
    SyncSalesByLotDto as SharedSyncSalesByLotDto,
    SyncSaleType as SharedSyncSaleType,
    SyncSinglesCatalogSource as SharedSyncSinglesCatalogSource,
    SyncSinglesPurchaseDto as SharedSyncSinglesPurchaseDto,
    SyncSnapshotDto as SharedSyncSnapshotDto,
    SyncTierDeductionType as SharedSyncTierDeductionType,
    SyncWheelConfigDto as SharedSyncWheelConfigDto,
    SyncWheelTierDto as SharedSyncWheelTierDto
} from "./shared/sync-contracts";
import type {
    GamePublicSessionBoardCell as SharedGamePublicSessionBoardCell,
    GamePublicSessionChaseEntry as SharedGamePublicSessionChaseEntry,
    GamePublicSessionChaseHistoryEntry as SharedGamePublicSessionChaseHistoryEntry,
    GamePublicSessionFairnessEntry as SharedGamePublicSessionFairnessEntry,
    GamePublicSessionOutcomeSlot as SharedGamePublicSessionOutcomeSlot,
    GamePublicSessionSnapshot as SharedGamePublicSessionSnapshot,
    GamePublicSessionStatus as SharedGamePublicSessionStatus,
    GameSpectatorHeatLevel as SharedGameSpectatorHeatLevel
} from "./shared/game-public-session-contracts";

export type ApiEnvironment = "dev" | "prod";

export interface ApiConfig {
  apiEnv: ApiEnvironment;
  authBypassDev: boolean;
  migrationsAdminKey: string;
  whatnotClientId?: string;
  whatnotClientSecret?: string;
  whatnotRedirectUri?: string;
  whatnotAppReturnUrl?: string;
  whatnotOauthAuthorizeUrl?: string;
  whatnotOauthTokenUrl?: string;
  whatnotApiBaseUrl?: string;
  whatnotTokenEncryptionSecret?: string;
  realtimePublishUrl?: string;
  realtimeInternalApiKey?: string;
  realtimeTokenSecret?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripeOneTimePriceId?: string;
  stripeSuccessUrl?: string;
  stripeCancelUrl?: string;
  googleClientId: string;
  googlePlayPackageName: string;
  googlePlayProProductIds: string[];
  googlePlayServiceAccountEmail: string;
  googlePlayServiceAccountPrivateKey: string;
  allowedOrigins: string[];
  cosmosEndpoint: string;
  cosmosKey: string;
  cosmosDatabaseId: string;
  migrationCosmosDatabaseId: string;
  entitlementsContainerId: string;
  syncContainerId: string;
  syncImportSourceCosmosEndpoint?: string;
  syncImportSourceCosmosKey?: string;
  syncImportSourceCosmosDatabaseId?: string;
  syncImportSourceSyncContainerId?: string;
  migrationRunsContainerId: string;
  cardCatalogContainerId?: string;
  sessionsContainerId?: string;
  sessionCookieName?: string;
  sessionIdleTtlSeconds?: number;
  sessionAbsoluteTtlSeconds?: number;
  sessionTouchIntervalSeconds?: number;
}

export interface SessionDocument {
  id: string;
  docType: "session";
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

export type GamePublicSessionStatus = SharedGamePublicSessionStatus;
export type GameSpectatorHeatLevel = SharedGameSpectatorHeatLevel;
export type GamePublicSessionFairnessEntry = SharedGamePublicSessionFairnessEntry;
export type GamePublicSessionChaseEntry = SharedGamePublicSessionChaseEntry;
export type GamePublicSessionChaseHistoryEntry = SharedGamePublicSessionChaseHistoryEntry;
export type GamePublicSessionOutcomeSlot = SharedGamePublicSessionOutcomeSlot;
export type GamePublicSessionBoardCell = SharedGamePublicSessionBoardCell;
export type GamePublicSessionSnapshot = SharedGamePublicSessionSnapshot;

export type WheelPublicSessionStatus = GamePublicSessionStatus;
export type WheelSpectatorHeatLevel = GameSpectatorHeatLevel;
export type WheelPublicSessionFairnessEntry = GamePublicSessionFairnessEntry;
export type WheelPublicSessionChaseEntry = GamePublicSessionChaseEntry;
export type WheelPublicSessionChaseHistoryEntry = GamePublicSessionChaseHistoryEntry;
export type WheelPublicSessionSlot = GamePublicSessionOutcomeSlot;
export type WheelPublicSessionGridCell = GamePublicSessionBoardCell;
export type WheelPublicSessionSnapshot = GamePublicSessionSnapshot;

export interface WheelPublicSessionDocument {
  id: string;
  docType: "wheel_public_session";
  publicSessionId: string;
  ownerUserId: string;
  scopeType: "user" | "workspace";
  scopeId: string;
  workspaceId?: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt?: string | null;
  snapshot: WheelPublicSessionSnapshot;
}

export interface WheelFairnessProofLayoutSlot {
  name: string;
  color: string;
  tier: string;
  isChase: boolean;
}

export interface WheelFairnessProofDocument {
  id: string;
  docType: "wheel_fairness_proof";
  proofId: string;
  createdAt: string;
  serverSeed: string;
  clientSeed: string;
  slotCount: number;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  slotLabel: string | null;
  wheelName: string | null;
  spinNumber: number | null;
}

export interface EntitlementDocument {
  id: string;
  userId: string;
  hasProAccess: boolean;
  purchaseSource?: string;
  updatedAt: string;
}

export type UserProfileDisplayNameSource = "provider" | "user";

export interface UserProfileDocument {
  id: string;
  docType: "user_profile";
  userId: string;
  displayName: string;
  displayNameSource: UserProfileDisplayNameSource;
  photoUrl?: string;
  updatedAt: string;
}

export interface PlayPurchaseDocument {
  id: string;
  docType: "play_purchase";
  userId: string;
  purchaseTokenHash: string;
  packageName: string;
  productId: string;
  orderId: string | null;
  purchaseState: number | null;
  acknowledgementState: number | null;
  consumptionState: number | null;
  purchaseTimeMillis: string | null;
  updatedAt: string;
}

export interface PurchaseVerificationResultDocument {
  id: string;
  docType: "purchase_verification_result";
  userId: string;
  provider: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceRole = "owner" | "member";
export type WorkspaceStatus = "active" | "deleted";
export type WorkspaceMembershipStatus = "active" | "disabled" | "removed";
export type WorkspaceJoinLinkStatus = "active" | "revoked" | "expired" | "used";

export interface WorkspaceDocument {
  id: string;
  docType: "workspace";
  userId: string;
  workspaceId: string;
  name: string;
  ownerUserId: string;
  status?: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembershipDocument {
  id: string;
  docType: "workspace_membership";
  userId: string;
  workspaceId: string;
  role?: WorkspaceRole;
  status?: WorkspaceMembershipStatus;
  displayName?: string;
  photoUrl?: string;
  updatedAt: string;
}

export interface WorkspaceJoinLinkDocument {
  id: string;
  docType: "workspace_join_link";
  userId: string;
  inviteId: string;
  workspaceId: string;
  createdByUserId: string;
  role: "member";
  status: WorkspaceJoinLinkStatus;
  tokenHash: string;
  expiresAt: string;
  usedByUserId?: string;
  usedAt?: string;
  updatedAt: string;
}

export type SyncEntityRecord = SharedSyncEntityRecord;
export type SyncAdditionalFeeAppliesTo = SharedSyncAdditionalFeeAppliesTo;
export type SyncCostInputMode = SharedSyncCostInputMode;
export type SyncCurrencyCode = SharedSyncCurrencyCode;
export type SyncFeeProfilePreset = SharedSyncFeeProfilePreset;
export type SyncGameFairnessEntryDto = SharedSyncGameFairnessEntryDto;
export type SyncGameSessionDto = SharedSyncGameSessionDto;
export type SyncGameTallyEntryDto = SharedSyncGameTallyEntryDto;
export type SyncInventoryIssueDto = SharedSyncInventoryIssueDto;
export type SyncLotDto = SharedSyncLotDto;
export type SyncLotType = SharedSyncLotType;
export type SyncMetadataDto = SharedSyncMetadataDto;
export type SyncSaleType = SharedSyncSaleType;
export type SyncSaleLineDto = SharedSyncSaleLineDto;
export type SyncSaleDto = SharedSyncSaleDto;
export type SyncSinglesCatalogSource = SharedSyncSinglesCatalogSource;
export type SyncSinglesPurchaseDto = SharedSyncSinglesPurchaseDto;
export type SyncTierDeductionType = SharedSyncTierDeductionType;
export type SyncWheelTierDto = SharedSyncWheelTierDto;
export type SyncWheelConfigDto = SharedSyncWheelConfigDto;
export type SyncLivePricingDto = SharedSyncLivePricingDto;
export type SyncSalesByLotDto = SharedSyncSalesByLotDto;
export type SyncSnapshotDto = SharedSyncSnapshotDto;
export type SyncPayloadDto = SharedSyncPayloadDto;

export interface SyncSnapshotPayload {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
}

export interface SyncSnapshotDocument extends SyncSnapshotPayload {
  id: string;
  userId: string;
  version: number;
  updatedAt: string;
}

export interface SyncPresetDocument {
  id: string;
  docType: "sync_preset";
  userId: string;
  presetId: string;
  preset: unknown;
  sales: unknown[];
  version: number;
  updatedAt: string;
}

export interface SyncMetaDocument extends Omit<SyncMetadataDto, "activeWheelConfigId"> {
  id: string;
  docType: "sync_meta";
  userId: string;
  updatedAt: string;
  wheelConfigs?: SyncWheelConfigDto[];
  activeWheelConfigId?: number | null;
}

export type WhatnotConnectionStatus = "active" | "disconnected" | "error";
export type WhatnotImportBatchStatus = "pending_review" | "completed" | "failed";
export type WhatnotSaleImportAction = "create" | "update" | "skip";
export type WhatnotTargetMatchSource = "remembered" | "title" | "none";
export type WhatnotMappedSaleType = "pack" | "box" | "rtyh" | "wheel";
export type WhatnotImportBatchOrigin = "oauth_sync" | "csv_manual";
export type WhatnotImportDecisionKind = "new" | "whatnot_mapping" | "manual_candidate";

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

export interface WhatnotConnectionDocument {
  id: string;
  docType: "whatnot_connection";
  userId: string;
  scopeKey: string;
  scopeType: "user" | "workspace";
  scopeId: string;
  provider: "whatnot";
  externalAccountId: string;
  externalDisplayName?: string;
  scopes: string[];
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  tokenExpiresAt: string;
  connectedByUserId: string;
  lastSyncedAt?: string;
  syncCursor?: string | null;
  syncWindowStartedAt?: string | null;
  updatedAt: string;
  status: WhatnotConnectionStatus;
}

export interface WhatnotOAuthStateDocument {
  id: string;
  docType: "whatnot_oauth_state";
  userId: string;
  provider: "whatnot";
  state: string;
  scopeKey: string;
  scopeType: "user" | "workspace";
  scopeId: string;
  appReturnUrl?: string;
  createdByUserId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatnotImportRowDocument {
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
  payloadFingerprint: string;
  action: WhatnotSaleImportAction;
  suggestedLotId?: number;
  suggestedSaleType?: WhatnotMappedSaleType;
  suggestedPacksCount?: number;
  matchSource: WhatnotTargetMatchSource;
  existingSaleId?: string;
  targetKind?: WhatnotImportDecisionKind;
  targetSaleId?: string;
  manualDuplicateCandidate?: WhatnotManualDuplicateCandidate;
  requiresManualReview: boolean;
}

export interface WhatnotNormalizedImportRowInput {
  externalSaleId?: string;
  externalOrderId: string;
  externalOrderItemId: string;
  externalAccountId?: string;
  title: string;
  listingTitle?: string;
  sku?: string;
  productCategory?: string;
  buyerName?: string;
  quantity?: number;
  price: number;
  originalItemPrice?: number;
  buyerShipping?: number;
  date: string;
  orderPlacedAt?: string;
  orderPlacedAtRaw?: string;
  orderStatus?: string;
  listingId?: string;
  productId?: string;
  variantId?: string;
}

export interface WhatnotImportBatchDocument {
  id: string;
  docType: "whatnot_import_batch";
  userId: string;
  scopeKey: string;
  provider: "whatnot";
  batchId: string;
  origin: WhatnotImportBatchOrigin;
  externalAccountId: string;
  startedByUserId: string;
  status: WhatnotImportBatchStatus;
  startedAt: string;
  completedAt?: string | null;
  updatedAt: string;
  importWindowStartedAt: string;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  rows: WhatnotImportRowDocument[];
  errorMessage?: string;
}

export interface WhatnotTargetMappingDocument {
  id: string;
  docType: "whatnot_target_mapping";
  userId: string;
  scopeKey: string;
  provider: "whatnot";
  externalAccountId: string;
  matchKey: string;
  lotId: string;
  saleType: WhatnotMappedSaleType;
  updatedAt: string;
  confirmedByUserId: string;
}

export interface WhatnotSaleImportMappingDocument {
  id: string;
  docType: "sale_import_mapping";
  userId: string;
  scopeKey: string;
  provider: "whatnot";
  externalAccountId: string;
  externalSaleId: string;
  externalOrderId: string;
  externalOrderItemId: string;
  lotId: string;
  saleId: string;
  payloadFingerprint: string;
  updatedAt: string;
}

export interface SaleDocument {
  id: string;
  docType: "sale";
  userId: string;
  scopeKey: string;
  lotId: string;
  saleId: string;
  sale: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string;
  mutationId: string;
  deletedAt?: string | null;
}

export interface LotLivePricingDocument {
  id: string;
  docType: "lot_live_pricing";
  userId: string;
  scopeKey: string;
  lotId: string;
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
  version: number;
  updatedAt: string;
  updatedBy: string;
  mutationId: string;
}

export interface SyncPushPayload {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  activeLotId?: number;
  clientVersion?: number;
  allowEmptyOverwrite?: boolean;
  workspaceId?: string;
}

export interface SyncPullPayload {
  workspaceId?: string;
}

export type MigrationRunStatus = "running" | "succeeded" | "failed";

export interface MigrationRunDocument {
  id: string;
  docType: "migration_run";
  migrationId: string;
  status: MigrationRunStatus;
  dryRun: boolean;
  startedAt: string;
  completedAt: string | null;
  triggeredByUserId: string;
  note?: string;
  result?: Record<string, unknown> | null;
  errorMessage?: string;
}

export interface MigrationMarkerDocument {
  id: string;
  docType: "migration_marker";
  migrationId: string;
  updatedAt: string;
  lastRunId: string;
  triggeredByUserId: string;
  note: string;
  result: Record<string, unknown> | null;
}
