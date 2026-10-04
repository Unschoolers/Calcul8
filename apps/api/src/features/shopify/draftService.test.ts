import { expect, test } from "vitest";
import { buildShopifyDraftPreview, shopifyDraftHandle } from "./draftService";
import { ShopifyErrorCode } from "../../shared/shopify-errors";

function expectCode(run: () => unknown, code: string): void {
  try { run(); } catch (error) { expect(error).toMatchObject({ code }); return; }
  throw new Error(`Expected validation to throw ${code}`);
}

test("preview derives a sealed-box draft from saved lot data and sales", () => {
  const result = buildShopifyDraftPreview({
    scopeKey: "ws:42", shop: "a.myshopify.com", generation: 3,
    lot: { id: 7, lotType: "bulk", name: "  Set X  ", boxesPurchased: 8, packsPerBox: 12, boxPriceSell: 90, externalSku: " X-7 ", sellingCurrency: "USD" },
    sales: [{ type: "box", quantity: 1, packsCount: 0 }, { type: "pack", quantity: 2, packsCount: 24 }],
    locations: [{ id: "gid://shopify/Location/1", name: "Main", isActive: true }], shopCurrency: "USD"
  });
  expect(result.preview).toMatchObject({ title: "Set X — Booster box", variantTitle: "Booster box", sku: "X-7", price: "90.00", currency: "USD", quantity: 5, locations: [{ id: "gid://shopify/Location/1", name: "Main" }] });
  expect(result.preview.previewToken).toMatch(/^[a-f0-9]{64}$/);
  expect(result.handle).toMatch(/^calcul8-created-/);
});

test("preview rejects store currency mismatch and unsafe stock", () => {
  const base = { scopeKey: "user:1", shop: "a.myshopify.com", generation: 0, lot: { id: 1, lotType: "bulk", boxesPurchased: 1, packsPerBox: 10, boxPriceSell: 5, sellingCurrency: "CAD" }, sales: [], locations: [{ id: "gid://shopify/Location/1", name: "Main", isActive: true }], shopCurrency: "USD" };
  expectCode(() => buildShopifyDraftPreview(base), ShopifyErrorCode.CURRENCY_MISMATCH);
  expectCode(() => buildShopifyDraftPreview({ ...base, shopCurrency: "CAD", lot: { ...base.lot, boxesPurchased: -1 } }), ShopifyErrorCode.INVENTORY_INVALID);
});

test("preview fingerprint changes when active locations change", () => {
  const base = { scopeKey: "user:1", shop: "a.myshopify.com", generation: 0, lot: { id: 1, lotType: "bulk", boxesPurchased: 1, packsPerBox: 10, boxPriceSell: 5, sellingCurrency: "USD" }, sales: [], locations: [{ id: "gid://shopify/Location/1", name: "Main", isActive: true }], shopCurrency: "USD" };
  const one = buildShopifyDraftPreview(base).preview.previewToken;
  const two = buildShopifyDraftPreview({ ...base, locations: [...base.locations, { id: "gid://shopify/Location/2", name: "West", isActive: true }] }).preview.previewToken;
  expect(two).not.toBe(one);
});

test("preview rounds currency price to cents and rejects values that round to zero", () => {
  const base = { scopeKey: "user:1", shop: "a.myshopify.com", generation: 0, lot: { id: 1, lotType: "bulk", boxesPurchased: 1, packsPerBox: 10, boxPriceSell: 1.006, sellingCurrency: "USD" }, sales: [], locations: [{ id: "gid://shopify/Location/1", name: "Main", isActive: true }], shopCurrency: "USD" };
  expect(buildShopifyDraftPreview(base).preview.price).toBe("1.01");
  expectCode(() => buildShopifyDraftPreview({ ...base, lot: { ...base.lot, boxPriceSell: 0.004 } }), ShopifyErrorCode.PRICE_REQUIRED);
});

test("preview rejects quantities outside Shopify GraphQL Int", () => {
  const base = { scopeKey: "user:1", shop: "a.myshopify.com", generation: 0, lot: { id: 1, lotType: "bulk", boxesPurchased: 2_147_483_648, packsPerBox: 10, boxPriceSell: 1, sellingCurrency: "USD" }, sales: [], locations: [{ id: "gid://shopify/Location/1", name: "Main", isActive: true }], shopCurrency: "USD" };
  expectCode(() => buildShopifyDraftPreview(base), ShopifyErrorCode.INVENTORY_INVALID);
});


test("final preview binds custom title, price and location alongside authoritative stock", () => {
  const base = { scopeKey: "u", shop: "a.myshopify.com", generation: 1, lot: { id: 7, name: "Set", lotType: "bulk", boxesPurchased: 3, packsPerBox: 10, boxPriceSell: 5, sellingCurrency: "CAD" }, sales: [], locations: [{ id: "gid://shopify/Location/1", name: "Main", isActive: true }, { id: "gid://shopify/Location/2", name: "Other", isActive: true }], shopCurrency: "CAD" };
  const overrides = { title: "Custom", price: "23.50", locationId: "gid://shopify/Location/1" };
  const one = buildShopifyDraftPreview({ ...base, overrides });
  expect(one.preview).toMatchObject({ title: "Custom", price: "23.50", variantTitle: "Booster box", quantity: 3 });
  expect(buildShopifyDraftPreview({ ...base, overrides: { ...overrides, locationId: "gid://shopify/Location/2" } }).preview.previewToken).not.toBe(one.preview.previewToken);
  expect(buildShopifyDraftPreview({ ...base, overrides: { ...overrides, price: "24.00" } }).preview.previewToken).not.toBe(one.preview.previewToken);
  expect(() => buildShopifyDraftPreview({ ...base, overrides: { ...overrides, title: "" } })).toThrow();
});

test("draft preview carries the lot image and becomes stale when only the image changes", () => {
  const input = { scopeKey: "u", shop: "a.myshopify.com", generation: 1,
    lot: { id: 7, name: "Box", image: "data:image/jpeg;base64,/9j/2Q==", boxesPurchased: 3, packsPerBox: 12, boxPriceSell: 20 }, sales: [],
    locations: [{ id: "gid://shopify/Location/4", name: "Main", isActive: true }], shopCurrency: "CAD" };
  const first = buildShopifyDraftPreview(input);
  expect(first.image).toBe("data:image/jpeg;base64,/9j/2Q==");
  expect(buildShopifyDraftPreview({ ...input, lot: { ...input.lot, image: "data:image/png;base64,iVBORw==" } }).preview.previewToken).not.toBe(first.preview.previewToken);
  expect(buildShopifyDraftPreview({ ...input, lot: { ...input.lot, image: undefined } }).image).toBeUndefined();
});
