import assert from "node:assert/strict";
import { test } from "vitest";
import {
  normalizeSinglesCatalogSource,
  resolveDefaultSinglesCatalogSourceFromValue
} from "../src/app-core/shared/singles-catalog-source.ts";

test("resolveDefaultSinglesCatalogSourceFromValue maps env-like values to supported source", () => {
  assert.equal(resolveDefaultSinglesCatalogSourceFromValue("none"), "none");
  assert.equal(resolveDefaultSinglesCatalogSourceFromValue("pokemon"), "pokemon");
  assert.equal(resolveDefaultSinglesCatalogSourceFromValue("pkmn"), "pokemon");
  assert.equal(resolveDefaultSinglesCatalogSourceFromValue("ua"), "ua");
  assert.equal(resolveDefaultSinglesCatalogSourceFromValue(""), "ua");
  assert.equal(resolveDefaultSinglesCatalogSourceFromValue("  unknown  "), "ua");
});

test("normalizeSinglesCatalogSource normalizes aliases and uses fallback for unknown values", () => {
  assert.equal(normalizeSinglesCatalogSource("none", "ua"), "none");
  assert.equal(normalizeSinglesCatalogSource("pokemon", "ua"), "pokemon");
  assert.equal(normalizeSinglesCatalogSource("pkmn", "ua"), "pokemon");
  assert.equal(normalizeSinglesCatalogSource("ua", "pokemon"), "ua");
  assert.equal(normalizeSinglesCatalogSource("unknown", "pokemon"), "pokemon");
  assert.equal(normalizeSinglesCatalogSource(null, "none"), "none");
});
