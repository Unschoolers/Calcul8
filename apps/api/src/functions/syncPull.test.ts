import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const { getConfigMock, getEffectiveSyncSnapshotMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock
}));

import { syncPull } from "./syncPull";

function createConfig(): ApiConfig {
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
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createRequest(method = "POST", headers: Record<string, string> = {}) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    method,
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    }
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = (async (input: unknown) => {
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
  getConfigMock.mockReturnValue(createConfig());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("syncPull returns empty snapshot when no cloud state exists", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue(null);
  const request = createRequest("POST", { authorization: "Bearer user-1" });
  const context = createContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    userId: "user-1",
    snapshot: {
      lots: [],
      salesByLot: {},
      version: 0,
      updatedAt: null
    }
  });
});

test("syncPull returns existing snapshot payload", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{ id: 10 }],
    salesByLot: { "10": [{ id: 1 }] },
    version: 8,
    updatedAt: "2026-02-21T00:00:00.000Z"
  });
  const request = createRequest("POST", { authorization: "Bearer user-2" });
  const context = createContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { snapshot: { version: number } }).snapshot.version, 8);
});

test("syncPull returns server error when snapshot read fails", async () => {
  getEffectiveSyncSnapshotMock.mockRejectedValue(new Error("boom"));
  const request = createRequest("POST", { authorization: "Bearer user-3" });
  const context = createContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 500);
  assert.equal((response.jsonBody as { error: string }).error, "Failed to load cloud sync data.");
  assert.equal(context.error.mock.calls.length, 1);
});
