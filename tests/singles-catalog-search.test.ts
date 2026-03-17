import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSinglesCardImageCacheKey,
  createSinglesCardSuggestionValue,
  mapCardSearchItemToSuggestion,
  matchesCardSuggestionQuery,
  normalizeSinglesSearchTokens,
  resolveCardSearchBackendQuery
} from "../src/components/windows/singles/singlesCatalogSearch.ts";

test("normalizeSinglesSearchTokens lowercases and splits query text", () => {
  assert.deepEqual(normalizeSinglesSearchTokens("  Blue  Eyes  White "), ["blue", "eyes", "white"]);
  assert.deepEqual(normalizeSinglesSearchTokens(""), []);
});

test("createSinglesCardSuggestionValue and image cache key normalize values", () => {
  assert.equal(createSinglesCardSuggestionValue("Pikachu", " 25 ", "Rare"), "Pikachu|25|Rare");
  assert.equal(
    createSinglesCardImageCacheKey("pokemon", " Pikachu ", " 25 "),
    "pokemon|pikachu|25"
  );
});

test("mapCardSearchItemToSuggestion ignores empty names and normalizes market value", () => {
  assert.equal(mapCardSearchItemToSuggestion({ cardNo: "25" }, 0), null);

  assert.deepEqual(
    mapCardSearchItemToSuggestion(
      {
        name: "Pikachu",
        cardNo: "25",
        image: "https://example.test/pikachu.png",
        rarity: "Rare",
        marketPrice: "12.5" as unknown as number
      },
      3
    ),
    {
      title: "Pikachu #25",
      value: "Pikachu|25|Rare",
      name: "Pikachu",
      cardNo: "25",
      image: "https://example.test/pikachu.png",
      rarity: "Rare",
      marketPrice: 12.5
    }
  );
});

test("matchesCardSuggestionQuery supports text, card number, and rarity star tokens", () => {
  const suggestion = {
    title: "Blue-Eyes White Dragon #001",
    value: "Blue-Eyes White Dragon|001|* Rare",
    name: "Blue-Eyes White Dragon",
    cardNo: "001",
    image: "",
    rarity: "★ Rare",
    marketPrice: null
  };

  assert.equal(matchesCardSuggestionQuery(suggestion, "blue eyes"), true);
  assert.equal(matchesCardSuggestionQuery(suggestion, "001"), true);
  assert.equal(matchesCardSuggestionQuery(suggestion, "* ra"), true);
  assert.equal(matchesCardSuggestionQuery(suggestion, "dark magician"), false);
});

test("resolveCardSearchBackendQuery preserves meaningful queries and rejects empty ones", () => {
  assert.equal(resolveCardSearchBackendQuery("  pikachu 25 "), "pikachu 25");
  assert.equal(resolveCardSearchBackendQuery("   "), "");
  assert.equal(resolveCardSearchBackendQuery("***"), "");
});
