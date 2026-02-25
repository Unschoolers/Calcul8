export type ApiEnvironment = "dev" | "prod";

export interface ApiConfig {
  apiEnv: ApiEnvironment;
  authBypassDev: boolean;
  migrationsAdminKey: string;
  googleClientId: string;
  googlePlayPackageName: string;
  googlePlayProProductIds: string[];
  googlePlayServiceAccountEmail: string;
  googlePlayServiceAccountPrivateKey: string;
  allowedOrigins: string[];
  cosmosEndpoint: string;
  cosmosKey: string;
  cosmosDatabaseId: string;
  entitlementsContainerId: string;
  syncContainerId: string;
  migrationRunsContainerId: string;
  cardCatalogContainerId?: string;
}

export interface EntitlementDocument {
  id: string;
  userId: string;
  hasProAccess: boolean;
  purchaseSource?: string;
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

export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceDocument {
  id: string;
  docType: "workspace";
  userId: string;
  workspaceId: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembershipDocument {
  id: string;
  docType: "workspace_membership";
  userId: string;
  workspaceId: string;
  role?: WorkspaceRole;
  status?: "active" | "disabled" | "removed";
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
}

export interface SyncPushPayload {
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
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
