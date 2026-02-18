import assert from "node:assert/strict";
import { test } from "node:test";
import { MIGRATION_REGISTRY, getMigrationById } from "./migrations/registry";
import { createFirstMigration } from "./migrations/definitions/firstMigration";
import { createMigrationRunner } from "./migrations/runner";
import type { ApiConfig } from "../types";
import type { MigrationContext, MigrationDefinition, MigrationPlan } from "./migrations/types";

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

test("first_migration analyze reads marker state", async () => {
  let readerCallCount = 0;
  const migration = createFirstMigration(async () => {
    readerCallCount += 1;
    return null;
  }, async () => {
    throw new Error("writer should not be called during analyze");
  });

  const result = await migration.analyze({
    runId: "run-1",
    dryRun: true,
    startedAt: "2026-01-01T00:00:00.000Z",
    triggeredByUserId: "tester",
    note: "dry-run",
    config: createConfigStub()
  });

  assert.equal(readerCallCount, 1);
  assert.equal(result?.markerExists, false);
  assert.equal(result?.markerId, "migration_marker:first_migration");
});

test("first_migration apply calls marker writer", async () => {
  let capturedMigrationId = "";
  const migration = createFirstMigration(async () => null, async (_config, input) => {
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

  const result = await migration.apply({
    runId: "run-2",
    dryRun: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    triggeredByUserId: "tester",
    note: "real-run",
    config: createConfigStub()
  }, {
    markerExists: false
  });

  assert.equal(capturedMigrationId, "first_migration");
  assert.equal(result?.dryRun, false);
  assert.equal(result?.markerId, "migration_marker:first_migration");
});

function createMigrationStub(): {
  migration: MigrationDefinition;
  calls: string[];
} {
  const calls: string[] = [];
  const migration: MigrationDefinition = {
    id: "stub",
    description: "stub migration",
    async analyze(_context: MigrationContext): Promise<MigrationPlan> {
      calls.push("analyze");
      return { planned: 1 };
    },
    async apply(_context: MigrationContext, _plan: MigrationPlan) {
      calls.push("apply");
      return { applied: 1 };
    }
  };

  return { migration, calls };
}

test("runner dry-run executes analyze and skips apply", async () => {
  const writes: string[] = [];
  const runner = createMigrationRunner(async (_config, document) => {
    writes.push(document.status);
    return document;
  });
  const { migration, calls } = createMigrationStub();

  const run = await runner({
    migration,
    config: createConfigStub(),
    dryRun: true,
    triggeredByUserId: "tester",
    note: "dry-run"
  });

  assert.deepEqual(calls, ["analyze"]);
  assert.deepEqual(writes, ["running", "succeeded"]);
  assert.equal(run.status, "succeeded");
  assert.equal((run.result as { mode?: string })?.mode, "dry_run");
});

test("runner real run executes analyze then apply", async () => {
  const writes: string[] = [];
  const runner = createMigrationRunner(async (_config, document) => {
    writes.push(document.status);
    return document;
  });
  const { migration, calls } = createMigrationStub();

  const run = await runner({
    migration,
    config: createConfigStub(),
    dryRun: false,
    triggeredByUserId: "tester",
    note: "real-run"
  });

  assert.deepEqual(calls, ["analyze", "apply"]);
  assert.deepEqual(writes, ["running", "succeeded"]);
  assert.equal(run.status, "succeeded");
  assert.equal((run.result as { mode?: string })?.mode, "applied");
});
