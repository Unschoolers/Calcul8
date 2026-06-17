import assert from "node:assert/strict";
import { test } from "vitest";
import { MIGRATION_REGISTRY, getMigrationById } from "./migrations/registry";
import { createFirstMigration } from "./migrations/definitions/firstMigration";
import { createSalesLiveEntityMigration } from "./migrations/definitions/salesLiveEntityMigration";
import { createMigrationRunner } from "./migrations/runner";
import type { ApiConfig, SyncSnapshotDocument } from "../types";
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
    migrationCosmosDatabaseId: "whatfees",
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

test("migration registry exposes sales_live_entity_migration", () => {
  const migration = getMigrationById("sales_live_entity_migration");
  assert.ok(migration);
  assert.equal(migration?.id, "sales_live_entity_migration");
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

test("sales_live_entity_migration analyze counts scopes, lots, sales, and skipped rows", async () => {
  const migration = createSalesLiveEntityMigration(
    async () => null,
    async () => {
      throw new Error("writer should not be called during analyze");
    },
    async () => ["u:1", "ws:team-2"],
    async (_config, scopeKey) => scopeKey === "u:1"
      ? {
        id: "sync:u:1",
        userId: "u:1",
        lots: [
          { id: 10, spotPrice: 1, boxPriceSell: 2, packPrice: 3 }
        ],
        salesByLot: {
          "10": [
            { id: 100, price: 5 },
            { price: 6 }
          ]
        },
        wheelConfigs: [],
        activeWheelConfigId: null,
        version: 1,
        updatedAt: "2026-03-17T00:00:00.000Z"
      // This fixture intentionally includes a malformed sale row so the
      // migration can prove it skips legacy storage data it cannot normalize.
      } as unknown as SyncSnapshotDocument
      : null,
    async () => {
      throw new Error("sale writer should not be called during analyze");
    },
    async () => {
      throw new Error("live writer should not be called during analyze");
    },
    async () => {
      throw new Error("mode writer should not be called during analyze");
    }
  );

  const result = await migration.analyze({
    runId: "run-entity-1",
    dryRun: true,
    startedAt: "2026-03-17T00:00:00.000Z",
    triggeredByUserId: "tester",
    note: "dry-run",
    config: createConfigStub()
  });

  assert.equal(result.scopeCount, 1);
  assert.equal(result.lotCount, 1);
  assert.equal(result.saleCount, 1);
  assert.equal(result.livePricingCount, 1);
  assert.equal(result.skippedSales, 1);
});

test("sales_live_entity_migration apply writes deterministic sales/live docs and sets entity modes", async () => {
  const writtenSales: Array<{ scopeKey: string; lotId: string; saleId: string; mutationId: string }> = [];
  const writtenLivePricing: Array<{ scopeKey: string; lotId: string; mutationId: string }> = [];
  const modeWrites: Array<{ scopeKey: string; salesMode: string; livePricingMode: string }> = [];
  let markerMigrationId = "";

  const migration = createSalesLiveEntityMigration(
    async () => null,
    async (_config, input) => {
      markerMigrationId = input.migrationId;
      return {
        id: "migration_marker:sales_live_entity_migration",
        docType: "migration_marker",
        migrationId: input.migrationId,
        updatedAt: "2026-03-17T00:00:01.000Z",
        lastRunId: input.runId,
        triggeredByUserId: input.triggeredByUserId,
        note: input.note,
        result: input.result
      };
    },
    async () => ["u:1"],
    async () => ({
      id: "sync:u:1",
      userId: "u:1",
      lots: [
        { id: 10, spotPrice: 1, boxPriceSell: 2, packPrice: 3 }
      ],
      salesByLot: {
        "10": [
          { id: 100, price: 5 }
        ]
      },
      wheelConfigs: [],
      activeWheelConfigId: null,
      version: 1,
      updatedAt: "2026-03-17T00:00:00.000Z"
    }),
    async (_config, input) => {
      writtenSales.push({
        scopeKey: input.scopeKey,
        lotId: input.lotId,
        saleId: input.saleId,
        mutationId: input.mutationId
      });
      return {
        id: "sale-doc",
        docType: "sale",
        userId: input.scopeKey,
        scopeKey: input.scopeKey,
        lotId: input.lotId,
        saleId: input.saleId,
        sale: input.sale,
        version: 1,
        updatedAt: "2026-03-17T00:00:00.000Z",
        updatedBy: input.updatedBy,
        mutationId: input.mutationId,
        deletedAt: null
      };
    },
    async (_config, input) => {
      writtenLivePricing.push({
        scopeKey: input.scopeKey,
        lotId: input.lotId,
        mutationId: input.mutationId
      });
      return {
        id: "live-doc",
        docType: "lot_live_pricing",
        userId: input.scopeKey,
        scopeKey: input.scopeKey,
        lotId: input.lotId,
        livePackPrice: input.livePackPrice,
        liveBoxPriceSell: input.liveBoxPriceSell,
        liveSpotPrice: input.liveSpotPrice,
        version: 1,
        updatedAt: "2026-03-17T00:00:00.000Z",
        updatedBy: input.updatedBy,
        mutationId: input.mutationId
      };
    },
    async (_config, input) => {
      modeWrites.push({
        scopeKey: input.scopeKey,
        salesMode: input.salesMode,
        livePricingMode: input.livePricingMode
      });
      return {
        id: "sync:meta:u:1",
        docType: "sync_meta",
        userId: input.scopeKey,
        version: 1,
        updatedAt: input.updatedAt,
        salesMode: input.salesMode,
        livePricingMode: input.livePricingMode
      };
    }
  );

  const result = await migration.apply({
    runId: "run-entity-2",
    dryRun: false,
    startedAt: "2026-03-17T00:00:00.000Z",
    triggeredByUserId: "tester",
    note: "real-run",
    config: createConfigStub()
  }, {
    markerExists: false
  });

  assert.equal(markerMigrationId, "sales_live_entity_migration");
  assert.deepEqual(writtenSales, [{
    scopeKey: "u:1",
    lotId: "10",
    saleId: "100",
    mutationId: "sales_live_entity_migration:sale:u:1:10:100"
  }]);
  assert.deepEqual(writtenLivePricing, [{
    scopeKey: "u:1",
    lotId: "10",
    mutationId: "sales_live_entity_migration:live:u:1:10"
  }]);
  assert.deepEqual(modeWrites, [{
    scopeKey: "u:1",
    salesMode: "entity",
    livePricingMode: "entity"
  }]);
  assert.equal(result?.migratedScopes, 1);
  assert.equal(result?.migratedSales, 1);
  assert.equal(result?.migratedLivePricing, 1);
});

function createMigrationStub(): {
  migration: MigrationDefinition;
  calls: string[];
} {
  const calls: string[] = [];
  const migration: MigrationDefinition = {
    id: "stub",
    description: "stub migration",
    rerunPolicy: "once",
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

test("runner blocks reapplying one-time migrations unless forced", async () => {
  const writes: string[] = [];
  const runner = createMigrationRunner(async (_config, document) => {
    writes.push(document.status);
    return document;
  });
  const calls: string[] = [];
  const migration: MigrationDefinition = {
    id: "stub_once",
    description: "once migration",
    rerunPolicy: "once",
    async analyze() {
      calls.push("analyze");
      return {
        alreadyApplied: true
      };
    },
    async apply() {
      calls.push("apply");
      return {};
    }
  };

  await assert.rejects(
    () => runner({
      migration,
      config: createConfigStub(),
      dryRun: false,
      triggeredByUserId: "tester",
      note: "blocked rerun"
    }),
    /already applied/
  );

  assert.deepEqual(calls, ["analyze"]);
  assert.deepEqual(writes, ["running", "failed"]);
});

test("runner allows forced reruns of one-time migrations", async () => {
  const writes: string[] = [];
  const runner = createMigrationRunner(async (_config, document) => {
    writes.push(document.status);
    return document;
  });
  const calls: string[] = [];
  const migration: MigrationDefinition = {
    id: "stub_force",
    description: "force migration",
    rerunPolicy: "once",
    async analyze() {
      calls.push("analyze");
      return {
        alreadyApplied: true
      };
    },
    async apply() {
      calls.push("apply");
      return { applied: 1 };
    }
  };

  const run = await runner({
    migration,
    config: createConfigStub(),
    dryRun: false,
    force: true,
    triggeredByUserId: "tester",
    note: "forced rerun"
  });

  assert.deepEqual(calls, ["analyze", "apply"]);
  assert.deepEqual(writes, ["running", "succeeded"]);
  assert.equal(run.status, "succeeded");
});

test("runner allows repeatable migrations to reapply without force", async () => {
  const writes: string[] = [];
  const runner = createMigrationRunner(async (_config, document) => {
    writes.push(document.status);
    return document;
  });
  const calls: string[] = [];
  const migration: MigrationDefinition = {
    id: "stub_repeatable",
    description: "repeatable migration",
    rerunPolicy: "repeatable",
    async analyze() {
      calls.push("analyze");
      return {
        alreadyApplied: true
      };
    },
    async apply() {
      calls.push("apply");
      return { applied: 1 };
    }
  };

  const run = await runner({
    migration,
    config: createConfigStub(),
    dryRun: false,
    triggeredByUserId: "tester",
    note: "repeatable rerun"
  });

  assert.deepEqual(calls, ["analyze", "apply"]);
  assert.deepEqual(writes, ["running", "succeeded"]);
  assert.equal(run.status, "succeeded");
});

