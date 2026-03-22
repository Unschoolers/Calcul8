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

export interface SyncSnapshotDocument {
  id: string;
  userId: string;
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
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

export interface SyncMetaDocument {
  id: string;
  docType: "sync_meta";
  userId: string;
  version: number;
  updatedAt: string;
  salesMode?: "snapshot" | "entity";
  livePricingMode?: "lot_defaults" | "entity";
}

export type WhatnotConnectionStatus = "active" | "disconnected" | "error";
export type WhatnotImportBatchStatus = "pending_review" | "completed" | "failed";
export type WhatnotSaleImportAction = "create" | "update" | "skip";
export type WhatnotTargetMatchSource = "remembered" | "title" | "none";
export type WhatnotMappedSaleType = "pack" | "box" | "rtyh";

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
  sku?: string;
  quantity: number;
  price: number;
  buyerShipping: number;
  date: string;
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
  requiresManualReview: boolean;
}

export interface WhatnotImportBatchDocument {
  id: string;
  docType: "whatnot_import_batch";
  userId: string;
  scopeKey: string;
  provider: "whatnot";
  batchId: string;
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
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
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
