import type { ApiConfig, ApiEnvironment } from "../types";

let cachedConfig: ApiConfig | null = null;

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

export function getConfig(): ApiConfig {
  if (cachedConfig) return cachedConfig;

  const apiEnvValue = readEnv("API_ENV").toLowerCase();
  const apiEnv: ApiEnvironment = apiEnvValue === "prod" ? "prod" : "dev";

  cachedConfig = {
    apiEnv,
    authBypassDev: parseBool(readEnv("AUTH_BYPASS_DEV"), apiEnv === "dev"),
    allowedOrigins: parseAllowedOrigins(readEnv("ALLOWED_ORIGINS")),
    cosmosEndpoint: requireEnv("COSMOSDB_ENDPOINT"),
    cosmosKey: requireEnv("COSMOSDB_KEY"),
    cosmosDatabaseId: readEnv("COSMOSDB_DATABASE_ID") || "calcul8tr",
    entitlementsContainerId: readEnv("COSMOSDB_ENTITLEMENTS_CONTAINER_ID") || "entitlements",
    syncContainerId: readEnv("COSMOSDB_SYNC_CONTAINER_ID") || "sync_data"
  };

  return cachedConfig;
}
