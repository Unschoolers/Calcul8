import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  assertMigrationAdminAccessMock,
  resolveMigrationActorMock,
  listMigrationRunsMock,
  maybeHandleHttpGuardsMock,
  jsonResponseMock,
  errorResponseMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  assertMigrationAdminAccessMock: vi.fn(),
  resolveMigrationActorMock: vi.fn(),
  listMigrationRunsMock: vi.fn(),
  maybeHandleHttpGuardsMock: vi.fn(),
  jsonResponseMock: vi.fn((request: unknown, config: unknown, status: number, body: unknown) => ({
    status,
    jsonBody: body
  })),
  errorResponseMock: vi.fn((request: unknown, config: unknown, error: unknown, message: string) => ({
    status: (error as { status?: number })?.status ?? 500,
    jsonBody: { error: message }
  }))
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/auth", () => ({
  HttpError: class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}));

vi.mock("../lib/http", () => ({
  maybeHandleHttpGuards: maybeHandleHttpGuardsMock,
  jsonResponse: jsonResponseMock,
  errorResponse: errorResponseMock
}));

vi.mock("../lib/migrations/adminAuth", () => ({
  assertMigrationAdminAccess: assertMigrationAdminAccessMock,
  resolveMigrationActor: resolveMigrationActorMock
}));

vi.mock("../lib/cosmos/migrationRepository", () => ({
  listMigrationRuns: listMigrationRunsMock
}));

import { migrationRunsList } from "./migrationRunsList";

function createConfig(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "secret-key",
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

function createRequest(url: string) {
  return {
    method: "GET",
    url,
    query: new URL(url).searchParams,
    headers: {
      get() {
        return null;
      }
    }
  };
}

function createContext() {
  return {
    error: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  maybeHandleHttpGuardsMock.mockReturnValue(null);
  resolveMigrationActorMock.mockReturnValue("admin-user");
  listMigrationRunsMock.mockResolvedValue([
    { id: "run-2" },
    { id: "run-1" }
  ]);
});

test("migrationRunsList returns filtered runs with parsed limit", async () => {
  const request = createRequest("https://example.test/api/migrations/runs?migrationId=first_migration&limit=5");

  const response = await migrationRunsList(request as never, createContext() as never);

  assert.equal(response.status, 200);
  assert.deepEqual(listMigrationRunsMock.mock.calls[0]?.[1], {
    migrationId: "first_migration",
    limit: 5
  });
  assert.deepEqual(response.jsonBody, {
    ok: true,
    requestedBy: "admin-user",
    migrationId: "first_migration",
    limit: 5,
    count: 2,
    runs: [
      { id: "run-2" },
      { id: "run-1" }
    ]
  });
});

test("migrationRunsList rejects invalid query limits", async () => {
  const request = createRequest("https://example.test/api/migrations/runs?limit=banana");
  const context = createContext();

  const response = await migrationRunsList(request as never, context as never);

  assert.equal(response.status, 400);
  assert.equal(listMigrationRunsMock.mock.calls.length, 0);
  assert.equal(context.error.mock.calls.length, 1);
});
