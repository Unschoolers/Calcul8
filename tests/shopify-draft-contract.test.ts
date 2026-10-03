import { expect, test } from "vitest";
import { normalizeDraftCreateMutation, normalizeDraftOverrides, normalizeProductDetailsMutation } from "../shared/shopify-product-manager.ts";
const overrides = { title: "  Custom Booster  ", price: "023.5", locationId: "gid://shopify/Location/1" };
test("final creation payload normalizes title and money and rejects unsafe values", () => {
  expect(normalizeDraftOverrides(overrides)).toEqual({ ...overrides, title: "Custom Booster", price: "23.50" });
  for (const value of [{ ...overrides, title: "" }, { ...overrides, price: "0" }, { ...overrides, price: "1.001" }, { ...overrides, quantity: 99 }, { ...overrides, locationId: "wrong" }]) expect(normalizeDraftOverrides(value)).toBeNull();
  const request = { lotId: 7, operationId: "op", expectedVersion: null, generation: 3, overrides, previewToken: "a".repeat(64) };
  expect(normalizeDraftCreateMutation(request)?.overrides.price).toBe("23.50");
  expect(normalizeDraftCreateMutation({ ...request, quantity: 99 })).toBeNull();
  expect(normalizeDraftCreateMutation({ ...request, expectedVersion: undefined })).toBeNull();
});
test("detail edits retain an observed zero price while requiring a positive desired price", () => {
  const request = { lotId: 7, operationId: "op", expectedVersion: "v", generation: 1, currency: "CAD", expected: { title: "Old", price: "0" }, draft: { title: "New", price: "10" } };
  expect(normalizeProductDetailsMutation(request)?.expected.price).toBe("0.00");
  expect(normalizeProductDetailsMutation({ ...request, draft: { title: "New", price: "0" } })).toBeNull();
});
