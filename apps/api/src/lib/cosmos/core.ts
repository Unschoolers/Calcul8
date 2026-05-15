import { CosmosClient, type Container } from "@azure/cosmos";
import type { ApiConfig } from "../../types";

export interface CosmosCache {
  entitlements: Container;
  syncSnapshots: Container;
  migrationRuns: Container;
  cardCatalog: Container;
  sessions: Container;
}

export interface ExternalSyncSourceConfig {
  endpoint: string;
  key: string;
  databaseId: string;
  syncContainerId: string;
}

let cosmosCache: CosmosCache | null = null;
const syncSourceContainerCache = new Map<string, Container>();
const COSMOS_MAX_RETRY_ATTEMPTS = 3;
const COSMOS_BASE_RETRY_DELAY_MS = 200;

export const EPOCH_DATE_ISO = "1970-01-01T00:00:00.000Z";

export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return (
    code === 404 ||
    statusCode === 404 ||
    code === "NotFound" ||
    code === "notfound"
  );
}

export function isConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return code === 409 || statusCode === 409 || code === "Conflict" || code === "conflict";
}

export function isPreconditionFailedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return code === 412 || statusCode === 412 || code === "PreconditionFailed" || code === "preconditionfailed";
}

function isRetryableCosmosError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const code = (error as { code?: unknown }).code;

  return (
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode === 449 ||
    statusCode === 500 ||
    statusCode === 503 ||
    code === "RequestTimeout" ||
    code === "TooManyRequests"
  );
}

function getRetryAfterMs(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const retryAfterInMs = (error as { retryAfterInMs?: unknown }).retryAfterInMs;
  if (typeof retryAfterInMs === "number" && Number.isFinite(retryAfterInMs) && retryAfterInMs >= 0) {
    return retryAfterInMs;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withCosmosRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableCosmosError(error) || attempt >= COSMOS_MAX_RETRY_ATTEMPTS) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);
      const exponentialDelayMs = COSMOS_BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 100);
      await sleep(retryAfterMs ?? exponentialDelayMs + jitterMs);
    }
  }
}

export function getContainers(config: ApiConfig): CosmosCache {
  if (cosmosCache) return cosmosCache;

  const client = new CosmosClient({
    endpoint: config.cosmosEndpoint,
    key: config.cosmosKey
  });
  const database = client.database(config.cosmosDatabaseId);

  cosmosCache = {
    entitlements: database.container(config.entitlementsContainerId),
    syncSnapshots: database.container(config.syncContainerId),
    migrationRuns: database.container(config.migrationRunsContainerId),
    cardCatalog: database.container(config.cardCatalogContainerId || "card_catalog"),
    sessions: database.container(config.sessionsContainerId || "sessions")
  };

  return cosmosCache;
}

export function getExternalSyncContainer(source: ExternalSyncSourceConfig): Container {
  const endpoint = String(source.endpoint || "").trim();
  const key = String(source.key || "").trim();
  const databaseId = String(source.databaseId || "").trim();
  const syncContainerId = String(source.syncContainerId || "").trim();

  if (!endpoint || !key || !databaseId || !syncContainerId) {
    throw new Error("Invalid external sync source configuration.");
  }

  const cacheKey = `${endpoint}|${databaseId}|${syncContainerId}|${key}`;
  const cached = syncSourceContainerCache.get(cacheKey);
  if (cached) return cached;

  const client = new CosmosClient({
    endpoint,
    key
  });
  const container = client.database(databaseId).container(syncContainerId);
  syncSourceContainerCache.set(cacheKey, container);
  return container;
}
