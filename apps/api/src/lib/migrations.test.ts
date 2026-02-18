import assert from "node:assert/strict";
import { test } from "node:test";
import { MIGRATION_REGISTRY, getMigrationById } from "./migrations/registry";
import { createFirstMigration } from "./migrations/definitions/firstMigration";
import type { ApiConfig } from "../types";

function createConfigStub(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "",
    googlePlayProProductIds: [],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "test-key",
    cosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

test("migration registry exposes first_migration", () => {
  const migration = getMigrationById("first_migration");
  assert.ok(migration);
  assert.equal(migration?.id, "first_migration");
  assert.equal(typeof migration?.description, "string");
});

test("migration registry returns null for unknown migration", () => {
  assert.equal(getMigrationById("unknown_migration"), null);
});

test("migration ids are unique", () => {
  const ids = MIGRATION_REGISTRY.map((migration) => migration.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test("first_migration dry-run returns preview and does not call writer", async () => {
  let writerCallCount = 0;
  const migration = createFirstMigration(async () => {
    writerCallCount += 1;
    throw new Error("writer should not be called in dry-run");
  });

  const result = await migration.run({
    runId: "run-1",
    dryRun: true,
    startedAt: "2026-01-01T00:00:00.000Z",
    triggeredByUserId: "tester",
    note: "dry-run",
    config: createConfigStub()
  });

  assert.equal(writerCallCount, 0);
  assert.equal(result?.dryRun, true);
  assert.equal(result?.markerId, "migration_marker:first_migration");
});

test("first_migration non-dry-run calls marker writer", async () => {
  let capturedMigrationId = "";
  const migration = createFirstMigration(async (_config, input) => {
    capturedMigrationId = input.migrationId;
    return {
      id: "migration_marker:first_migration",
      docType: "migration_marker",
      migrationId: input.migrationId,
      updatedAt: "2026-01-01T00:00:01.000Z",
      lastRunId: input.runId,
      triggeredByUserId: input.triggeredByUserId,
      note: input.note,
      result: input.result
    };
  });

  const result = await migration.run({
    runId: "run-2",
    dryRun: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    triggeredByUserId: "tester",
    note: "real-run",
    config: createConfigStub()
  });

  assert.equal(capturedMigrationId, "first_migration");
  assert.equal(result?.dryRun, false);
  assert.equal(result?.markerId, "migration_marker:first_migration");
});
