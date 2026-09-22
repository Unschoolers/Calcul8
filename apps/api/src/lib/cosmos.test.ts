import assert from "node:assert/strict";
import { test } from "vitest";
import { buildCardCatalogSearchClause } from "./cosmos/cardCatalogRepository";

test("buildCardCatalogSearchClause uses case-insensitive prefixes across name, number, and rarity", () => {
  const result = buildCardCatalogSearchClause("Gon Sr**");

  assert.equal(result.parameters.length, 2);
  assert.deepEqual(result.parameters, [
    { name: "@token0", value: "gon" },
    { name: "@token1", value: "sr★★" }
  ]);
  assert.equal(result.clause.includes("STARTSWITH(c.name, @token0, true)"), true);
  assert.equal(result.clause.includes("STARTSWITH(c.cardNo, @token0, true)"), true);
  assert.equal(result.clause.includes("STARTSWITH(c.rarity, @token1, true)"), true);
  assert.equal(result.clause.includes("CONTAINS("), false);
  assert.equal(result.clause.includes("LOWER("), false);
  assert.equal(result.clause.includes("AND"), true);
});

test("buildCardCatalogSearchClause keeps multi-star rarity tokens exact", () => {
  const result = buildCardCatalogSearchClause("sr***");

  assert.deepEqual(result.parameters, [{ name: "@token0", value: "sr★★★" }]);
  assert.equal(result.clause.includes("STARTSWITH(c.rarity, @token0, true)"), true);
  assert.equal(result.clause.includes("c.name"), false);
  assert.equal(result.clause.includes("c.cardNo"), false);
});

test("buildCardCatalogSearchClause drops empty wildcard-only tokens", () => {
  const result = buildCardCatalogSearchClause("  *   ");

  assert.equal(result.clause, "");
  assert.deepEqual(result.parameters, []);
});
