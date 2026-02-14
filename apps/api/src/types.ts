export type ApiEnvironment = "dev" | "prod";

export interface ApiConfig {
  apiEnv: ApiEnvironment;
  authBypassDev: boolean;
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
}

export interface EntitlementDocument {
  id: string;
  userId: string;
  hasProAccess: boolean;
  purchaseSource?: string;
  updatedAt: string;
}

export interface SyncSnapshotDocument {
  id: string;
  userId: string;
  presets: unknown[];
  salesByPreset: Record<string, unknown[]>;
  version: number;
  updatedAt: string;
}

export interface SyncPushPayload {
  presets: unknown[];
  salesByPreset: Record<string, unknown[]>;
  clientVersion?: number;
}
