import type { ApiConfig, ApiEnvironment } from "../types";

let cachedConfig: ApiConfig | null = null;

export function resetConfigForTests(): void {
  cachedConfig = null;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBool(value: string, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

function parseAllowedOrigins(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseCsv(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parsePositiveInt(raw: string, defaultValue: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return defaultValue;
  return normalized;
}

export function getConfig(): ApiConfig {
  if (cachedConfig) return cachedConfig;

  const apiEnvValue = readEnv("API_ENV").toLowerCase();
  const apiEnv: ApiEnvironment = apiEnvValue === "prod" ? "prod" : "dev";

  cachedConfig = {
    apiEnv,
    authBypassDev: parseBool(readEnv("AUTH_BYPASS_DEV"), apiEnv === "dev"),
    migrationsAdminKey: readEnv("MIGRATIONS_ADMIN_KEY"),
    googleClientId: readEnv("GOOGLE_OAUTH_CLIENT_ID"),
    googlePlayPackageName: readEnv("GOOGLE_PLAY_PACKAGE_NAME"),
    googlePlayProProductIds: parseCsv(readEnv("GOOGLE_PLAY_PRO_PRODUCT_IDS")),
    googlePlayServiceAccountEmail: readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL"),
    googlePlayServiceAccountPrivateKey: readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    allowedOrigins: parseAllowedOrigins(readEnv("ALLOWED_ORIGINS")),
    cosmosEndpoint: requireEnv("COSMOSDB_ENDPOINT"),
    cosmosKey: requireEnv("COSMOSDB_KEY"),
    cosmosDatabaseId: readEnv("COSMOSDB_DATABASE_ID") || "whatfees",
    entitlementsContainerId: readEnv("COSMOSDB_ENTITLEMENTS_CONTAINER_ID") || "entitlements",
    syncContainerId: readEnv("COSMOSDB_SYNC_CONTAINER_ID") || "sync_data",
    migrationRunsContainerId: readEnv("COSMOSDB_MIGRATION_RUNS_CONTAINER_ID") || "migration_runs",
    cardCatalogContainerId: readEnv("COSMOSDB_CARD_CATALOG_CONTAINER_ID") || "card_catalog",
    sessionsContainerId: readEnv("COSMOSDB_SESSIONS_CONTAINER_ID") || "sessions",
    sessionCookieName: readEnv("SESSION_COOKIE_NAME") || "whatfees_session",
    sessionIdleTtlSeconds: parsePositiveInt(readEnv("SESSION_IDLE_TTL_SECONDS"), 7 * 24 * 60 * 60),
    sessionAbsoluteTtlSeconds: parsePositiveInt(readEnv("SESSION_ABSOLUTE_TTL_SECONDS"), 30 * 24 * 60 * 60),
    sessionTouchIntervalSeconds: parsePositiveInt(readEnv("SESSION_TOUCH_INTERVAL_SECONDS"), 15 * 60)
  };

  return cachedConfig;
}
