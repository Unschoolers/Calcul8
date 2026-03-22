import type { ApiConfig } from "../types";
import { vi } from "vitest";

export function createApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs",
    ...overrides
  };
}

export function createHttpRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  query?: string;
} = {}) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    normalized.set(key.toLowerCase(), value);
  }

  const request: {
    method: string;
    params: Record<string, string>;
    url?: string;
    headers: {
      get(name: string): string | null;
    };
    json?: () => Promise<unknown>;
  } = {
    method: options.method ?? "POST",
    params: options.params ?? {},
    url: `https://api.example/${options.query ? `?${options.query}` : ""}`,
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    }
  };

  if (options.body !== undefined) {
    request.json = async () => options.body;
  }

  return request;
}

export function createInvocationContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

export function createGoogleUserInfoFetch(): typeof fetch {
  return (async (input: unknown) => {
    const raw = String(input);
    const tokenMatch = /[?&]id_token=([^&]+)/.exec(raw);
    const decodedToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "unknown-user";
    return {
      ok: true,
      json: async () => ({
        sub: decodedToken
      })
    } as Response;
  }) as typeof fetch;
}
