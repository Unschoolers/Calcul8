import { expect, test } from "vitest";
import type { BindingSummary } from "../shared/shopify-product-manager.ts";
import { isBindingSummary, projectShopifyLotLink } from "../src/domain/shopify-binding-summary.ts";

const summary: BindingSummary = { scopeKey: "user:a", shop: "store.myshopify.com", generation: 2, generatedAt: "2026-10-03T00:00:00Z", complete: true, connected: true, bindings: [{ lotId: 7, mode: "linked", version: "etag-1" }] };

test("accepts complete and partial safe summaries, rejecting malformed or duplicate identities", () => {
  expect(isBindingSummary(summary)).toBe(true);
  expect(isBindingSummary({ ...summary, complete: false })).toBe(true);
  for (const value of [null, {}, { ...summary, shop: "store.myshopify.com.evil.test" }, { ...summary, generation: -1 }, { ...summary, generatedAt: "invalid" }, { ...summary, bindings: [...summary.bindings, ...summary.bindings] }, { ...summary, bindings: [{ lotId: 7, mode: "unknown", version: "a" }] }, { ...summary, bindings: [{ lotId: 7, mode: "linked", version: "" }] }]) expect(isBindingSummary(value)).toBe(false);
});

test("only known bindings produce a link indicator and a switched store hides the old binding", () => {
  expect(projectShopifyLotLink(null, 7, { shop: null, status: "idle" })).toBeUndefined();
  expect(projectShopifyLotLink(summary, 8, { shop: summary.shop, status: "connected" })).toBeUndefined();
  expect(projectShopifyLotLink(summary, 7, { shop: "other.myshopify.com", status: "connected" })).toBeUndefined();
  expect(projectShopifyLotLink(summary, 7, { shop: summary.shop, status: "connected" })).toEqual({ mode: "linked", stale: false, disconnected: false, attention: false });
});

test("disconnect and failed refresh preserve known links without inventing a per-lot error", () => {
  expect(projectShopifyLotLink(summary, 7, { shop: null, status: "disconnected" })).toEqual({ mode: "linked", stale: true, disconnected: true, attention: false });
  expect(projectShopifyLotLink(summary, 7, { shop: summary.shop, status: "error" })).toEqual({ mode: "linked", stale: true, disconnected: false, attention: false });
  expect(projectShopifyLotLink(summary, 7, { shop: summary.shop, status: "connected" }, true, true)).toEqual({ mode: "linked", stale: true, disconnected: false, attention: true });
});
