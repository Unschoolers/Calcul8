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

function validateAllowedOrigins(apiEnv: ApiEnvironment, allowedOrigins: string[]): void {
  if (apiEnv === "prod" && allowedOrigins.includes("*")) {
    throw new Error("ALLOWED_ORIGINS cannot include wildcard * when API_ENV=prod.");
  }
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
  const allowedOrigins = parseAllowedOrigins(readEnv("ALLOWED_ORIGINS"));
  validateAllowedOrigins(apiEnv, allowedOrigins);

  cachedConfig = {
    apiEnv,
    authBypassDev: parseBool(readEnv("AUTH_BYPASS_DEV"), apiEnv === "dev"),
    migrationsAdminKey: readEnv("MIGRATIONS_ADMIN_KEY"),
    whatnotClientId: readEnv("WHATNOT_CLIENT_ID"),
    whatnotClientSecret: readEnv("WHATNOT_CLIENT_SECRET"),
    whatnotRedirectUri: readEnv("WHATNOT_REDIRECT_URI"),
    whatnotAppReturnUrl: readEnv("WHATNOT_APP_RETURN_URL"),
    whatnotOauthAuthorizeUrl: readEnv("WHATNOT_OAUTH_AUTHORIZE_URL"),
    whatnotOauthTokenUrl: readEnv("WHATNOT_OAUTH_TOKEN_URL"),
    whatnotApiBaseUrl: readEnv("WHATNOT_API_BASE_URL"),
    whatnotTokenEncryptionSecret: readEnv("WHATNOT_TOKEN_ENCRYPTION_SECRET"),
    realtimePublishUrl: readEnv("REALTIME_PUBLISH_URL"),
    realtimeInternalApiKey: readEnv("REALTIME_INTERNAL_API_KEY"),
    realtimeTokenSecret: readEnv("REALTIME_TOKEN_SECRET"),
    stripeSecretKey: readEnv("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: readEnv("STRIPE_WEBHOOK_SECRET"),
    stripeOneTimePriceId: readEnv("STRIPE_ONE_TIME_PRICE_ID"),
    stripeSuccessUrl: readEnv("STRIPE_SUCCESS_URL"),
    stripeCancelUrl: readEnv("STRIPE_CANCEL_URL"),
    googleClientId: readEnv("GOOGLE_OAUTH_CLIENT_ID"),
    googlePlayPackageName: readEnv("GOOGLE_PLAY_PACKAGE_NAME"),
    googlePlayProProductIds: parseCsv(readEnv("GOOGLE_PLAY_PRO_PRODUCT_IDS")),
    googlePlayServiceAccountEmail: readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL"),
    googlePlayServiceAccountPrivateKey: readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    allowedOrigins,
    cosmosEndpoint: requireEnv("COSMOSDB_ENDPOINT"),
    cosmosKey: requireEnv("COSMOSDB_KEY"),
    cosmosDatabaseId: readEnv("COSMOSDB_DATABASE_ID") || "whatfees",
    migrationCosmosDatabaseId: readEnv("MIGRATION_COSMOSDB_DATABASE_ID")
      || readEnv("COSMOSDB_DATABASE_ID")
      || "whatfees",
    entitlementsContainerId: readEnv("COSMOSDB_ENTITLEMENTS_CONTAINER_ID") || "entitlements",
    syncContainerId: readEnv("COSMOSDB_SYNC_CONTAINER_ID") || "sync_data",
    syncImportSourceCosmosEndpoint: readEnv("SYNC_IMPORT_SOURCE_COSMOSDB_ENDPOINT") || requireEnv("COSMOSDB_ENDPOINT"),
    syncImportSourceCosmosKey: readEnv("SYNC_IMPORT_SOURCE_COSMOSDB_KEY") || requireEnv("COSMOSDB_KEY"),
    syncImportSourceCosmosDatabaseId: readEnv("SYNC_IMPORT_SOURCE_COSMOSDB_DATABASE_ID")
      || readEnv("COSMOSDB_DATABASE_ID")
      || "whatfees",
    syncImportSourceSyncContainerId: readEnv("SYNC_IMPORT_SOURCE_COSMOSDB_SYNC_CONTAINER_ID")
      || readEnv("COSMOSDB_SYNC_CONTAINER_ID")
      || "sync_data",
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
