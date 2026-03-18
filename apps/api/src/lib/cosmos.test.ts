import assert from "node:assert/strict";
import { test } from "vitest";
import { buildCardCatalogSearchClause } from "./cosmos/cardCatalogRepository";

test("buildCardCatalogSearchClause matches tokens across name, number, and rarity", () => {
  const result = buildCardCatalogSearchClause("rei r*");

  assert.equal(result.parameters.length, 2);
  assert.deepEqual(result.parameters, [
    { name: "@token0", value: "rei" },
    { name: "@token1", value: "r*" }
  ]);
  assert.equal(result.clause.includes("CONTAINS(LOWER(c.name), @token0)"), true);
  assert.equal(result.clause.includes("CONTAINS(LOWER(c.cardNo), @token0)"), true);
  assert.equal(result.clause.includes("CONTAINS(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(c.rarity), '★', '*'), '☆', '*'), '✩', '*'), '✭', '*'), '✮', '*'), '✯', '*'), @token0)"), true);
  assert.equal(result.clause.includes("STARTSWITH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(c.rarity), '★', '*'), '☆', '*'), '✩', '*'), '✭', '*'), '✮', '*'), '✯', '*'), @token1)"), true);
  assert.equal(result.clause.includes("AND"), true);
});

test("buildCardCatalogSearchClause keeps multi-star rarity tokens exact", () => {
  const result = buildCardCatalogSearchClause("sr***");

  assert.deepEqual(result.parameters, [{ name: "@token0", value: "sr***" }]);
  assert.equal(result.clause.includes("STARTSWITH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(c.rarity), '★', '*'), '☆', '*'), '✩', '*'), '✭', '*'), '✮', '*'), '✯', '*'), @token0)"), true);
  assert.equal(result.clause.includes("LOWER(c.name)"), false);
  assert.equal(result.clause.includes("LOWER(c.cardNo)"), false);
});

test("buildCardCatalogSearchClause drops empty wildcard-only tokens", () => {
  const result = buildCardCatalogSearchClause("  *   ");

  assert.equal(result.clause, "");
  assert.deepEqual(result.parameters, []);
});
