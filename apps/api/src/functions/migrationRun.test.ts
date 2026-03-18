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
  getMigrationByIdMock,
  runMigrationMock,
  maybeHandleHttpGuardsMock,
  jsonResponseMock,
  errorResponseMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  assertMigrationAdminAccessMock: vi.fn(),
  resolveMigrationActorMock: vi.fn(),
  getMigrationByIdMock: vi.fn(),
  runMigrationMock: vi.fn(),
  maybeHandleHttpGuardsMock: vi.fn(),
  jsonResponseMock: vi.fn((request: unknown, config: unknown, status: number, body: unknown) => ({
    status,
    jsonBody: body
  })),
  errorResponseMock: vi.fn((request: unknown, config: unknown, error: unknown, message: string) => ({
    status: (error as { status?: number })?.status ?? 500,
    jsonBody: {
      error: message,
      detail: error instanceof Error ? error.message : String(error)
    }
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

vi.mock("../lib/migrations/registry", () => ({
  getMigrationById: getMigrationByIdMock
}));

vi.mock("../lib/migrations/runner", () => ({
  runMigration: runMigrationMock
}));

import { migrationRun } from "./migrationRun";

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

function createRequest(body: unknown) {
  return {
    method: "POST",
    headers: {
      get() {
        return null;
      }
    },
    json: vi.fn().mockResolvedValue(body)
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
  getMigrationByIdMock.mockReturnValue({
    id: "first_migration",
    description: "First migration"
  });
  runMigrationMock.mockResolvedValue({
    id: "run-1",
    migrationId: "first_migration",
    status: "completed"
  });
});

test("migrationRun parses defaults and runs the requested migration", async () => {
  const request = createRequest({
    migrationId: " first_migration "
  });

  const response = await migrationRun(request as never, createContext() as never);

  assert.equal(response.status, 200);
  assert.equal(assertMigrationAdminAccessMock.mock.calls.length, 1);
  assert.deepEqual(runMigrationMock.mock.calls[0]?.[0], {
    migration: {
      id: "first_migration",
      description: "First migration"
    },
    config: createConfig(),
    dryRun: true,
    force: false,
    triggeredByUserId: "admin-user",
    note: "manual run"
  });
  assert.deepEqual(response.jsonBody, {
    ok: true,
    migration: {
      id: "first_migration",
      description: "First migration"
    },
    run: {
      id: "run-1",
      migrationId: "first_migration",
      status: "completed"
    }
  });
});

test("migrationRun returns a 400-style error for invalid body fields", async () => {
  const request = createRequest({
    migrationId: "first_migration",
    dryRun: "yes please"
  });
  const context = createContext();

  const response = await migrationRun(request as never, context as never);

  assert.equal(response.status, 400);
  assert.equal(runMigrationMock.mock.calls.length, 0);
  assert.equal((response.jsonBody as { error: string }).error, "Failed to run migration.");
  assert.equal(context.error.mock.calls.length, 1);
});
