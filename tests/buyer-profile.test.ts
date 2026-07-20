import { describe, expect, test } from "vitest";
import {
  buildBuyerProfileIndex,
  buildBuyerProfileTagSuggestions,
  composeBuyerIdentity,
  matchesBuyerProfileSearch,
  normalizeBuyerProfileDto,
  normalizeBuyerProfileTags
} from "../src/app-core/buyer-profile.ts";

describe("buyer profile domain", () => {
  test("normalizes public profiles and tags without duplicating casing variants", () => {
    expect(normalizeBuyerProfileDto({
      username: " CardKing27 ",
      preferredName: " Marc ",
      tags: ["VIP", " vip ", " Pokémon "],
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T11:00:00.000Z",
      version: 2
    })).toEqual({
      username: "CardKing27",
      preferredName: "Marc",
      tags: ["VIP", "Pokémon"],
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T11:00:00.000Z",
      version: 2
    });
    expect(normalizeBuyerProfileTags(["A", "a", " B "])).toEqual(["A", "B"]);
  });

  test("rejects invalid profile DTOs at the frontend boundary", () => {
    expect(normalizeBuyerProfileDto({ username: "", tags: [], version: 1 })).toBeNull();
    expect(normalizeBuyerProfileDto({ username: "Alice", tags: "VIP", version: 1 })).toBeNull();
    expect(normalizeBuyerProfileDto({ username: "Alice", tags: [], version: -1 })).toBeNull();
  });

  test("indexes profiles by the existing normalized buyer key", () => {
    const alice = normalizeBuyerProfileDto({
      username: "Alice Smith",
      tags: [],
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      version: 1
    });
    const index = buildBuyerProfileIndex(alice ? [alice] : []);

    expect(index["alice smith"]).toEqual(alice);
  });

  test("composes a responsive identity while retaining the full accessible value", () => {
    const profile = normalizeBuyerProfileDto({
      username: "cardking27",
      preferredName: "Marc",
      tags: ["VIP"],
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      version: 1
    });

    expect(composeBuyerIdentity("cardking27", profile)).toEqual({
      username: "cardking27",
      preferredName: "Marc",
      primaryLabel: "Marc",
      secondaryLabel: "@cardking27",
      accessibleLabel: "Marc (@cardking27)",
      tags: ["VIP"]
    });
    expect(composeBuyerIdentity("cardking27", null)).toEqual({
      username: "cardking27",
      preferredName: null,
      primaryLabel: "@cardking27",
      secondaryLabel: null,
      accessibleLabel: "@cardking27",
      tags: []
    });
  });

  test("matches customer search by username, preferred name, or tag", () => {
    const buyer = normalizeBuyerProfileDto({
      username: "cardking27",
      preferredName: "Marc Beaulieu",
      tags: ["VIP", "Pokémon"],
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      version: 1
    });

    expect(matchesBuyerProfileSearch("cardking27", buyer, "king")).toBe(true);
    expect(matchesBuyerProfileSearch("cardking27", buyer, "beau")).toBe(true);
    expect(matchesBuyerProfileSearch("cardking27", buyer, "pokemon")).toBe(true);
    expect(matchesBuyerProfileSearch("cardking27", buyer, "wholesale")).toBe(false);
  });

  test("builds reusable tag suggestions without casing duplicates", () => {
    expect(buildBuyerProfileTagSuggestions([
      { username: "one", tags: ["VIP", "Local"], createdAt: "", updatedAt: "", version: 1 },
      { username: "two", tags: ["vip", "Pokémon"], createdAt: "", updatedAt: "", version: 1 }
    ])).toEqual(["Local", "Pokémon", "VIP"]);
  });
});
