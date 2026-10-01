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
  expect(result.preview).toMatchObject({ title: "Set X — sealed box", variantTitle: "Sealed box", sku: "X-7", price: "90.00", currency: "USD", quantity: 5, locations: [{ id: "gid://shopify/Location/1", name: "Main" }] });
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
