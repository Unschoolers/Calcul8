import assert from "node:assert/strict";
import { test } from "node:test";
import { MIGRATION_REGISTRY, getMigrationById } from "./migrations/registry";

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
