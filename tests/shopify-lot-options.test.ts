import { expect, test } from "vitest";
import { buildLotOptionItems, filterLotOptionItems } from "../src/app-core/shared/lot-option-items.ts";
import { singlesComputed } from "../src/app-core/computed/singles.ts";
import { shopifyBindingsScopeKey } from "../src/app-core/methods/ui/shopify/shopify-bindings.ts";

test("grouping and search preserve Shopify link metadata alongside completion", () => {
  const shopifyLink = { mode: "linked" as const, stale: false, disconnected: false, attention: false };
  const options = buildLotOptionItems([{ id: 7, name: "Kaiju", lotType: "bulk", isComplete: true, shopifyLink }, { id: 8, name: "Other" }], "en");
  const filtered = filterLotOptionItems(options, "Kaiju", "en");
  expect(filtered[0]).toMatchObject({ shopifyLink, completionIcon: "mdi-check-circle", isComplete: true });
  expect(options[1]?.shopifyLink).toBeUndefined();
});

test("computed options join same-scope bindings and omit them immediately after an account switch", () => {
  const context = { googleAuthEpoch: 1, activeScopeType: "personal", activeWorkspaceId: null, lots: [{ id: 7, name: "Kaiju", lotType: "bulk" }], preferredLanguage: "en", getAllSalesByLotId: () => ({}), getSalesCacheEntry: () => null, shopifyConnectionStatus: "connected", shopifyConnectionShop: "a.myshopify.com", shopifyBindingsStale: false, shopifyBindingsScope: "", shopifyBindingsSummary: { scopeKey: "u:42", shop: "a.myshopify.com", generation: 2, complete: true, connected: true, generatedAt: "2026-10-03T00:00:00Z", bindings: [{ lotId: 7, mode: "linked", version: "v1" }] } };
  context.shopifyBindingsScope = shopifyBindingsScopeKey(context);
  expect(singlesComputed.lotItems.call(context as never)[0]?.shopifyLink?.mode).toBe("linked");
  context.googleAuthEpoch++;
  expect(singlesComputed.lotItems.call(context as never)[0]?.shopifyLink).toBeUndefined();
});
