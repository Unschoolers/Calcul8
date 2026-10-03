import { screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { defineComponent } from "vue";
import ShopifyBindingDetails from "../../src/components/windows/shopify/ShopifyBindingDetails.vue";
import type { ShopifyEditListing } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

const t = (key: string) => ({ configShopifyBindingProduct: "Product", configShopifyBindingVariant: "Variant", configShopifyBindingSku: "SKU", configShopifyBindingLocation: "Inventory location", configShopifyNoSku: "No SKU", configShopifyUnknownLocation: "Unknown", configShopifyOpenProduct: "Open product in Shopify", configShopifyProductStatusDraft: "Draft", configShopifyProductStatusActive: "Active", configShopifyProductStatusArchived: "Archived", configShopifyProductStatusUnavailable: "Status unavailable" })[key] ?? key;

function renderDetails(listing: ShopifyEditListing) {
  return renderWithApp(ShopifyBindingDetails, { props: { listing, t } });
}

test.each(["managed", "linked"] as const)("shows %s binding details and safe admin link", (mode) => {
  renderDetails({ mode, shop: "store-a.myshopify.com", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", productTitle: "Booster Box", variantTitle: "Display", sku: "BOX-1", locationId: "gid://shopify/Location/7", locationName: "Main" });
  const card = screen.getByTestId("shopify-binding-details");
  expect(card).toHaveTextContent("Booster Box");
  expect(card).toHaveTextContent("Display");
  expect(card).toHaveTextContent("BOX-1");
  expect(card).toHaveTextContent("Main");
  expect(screen.getByRole("link", { name: "Open product in Shopify" })).toHaveAttribute("href", "https://store-a.myshopify.com/admin/products/123");
});

test("falls back to stored IDs and omits an unsafe admin link", () => {
  renderDetails({ mode: "managed", shop: "store.myshopify.com.evil.example", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", locationId: "gid://shopify/Location/7" });
  const card = screen.getByTestId("shopify-binding-details");
  expect(card).toHaveTextContent("gid://shopify/Product/123");
  expect(card).toHaveTextContent("gid://shopify/ProductVariant/456");
  expect(card).toHaveTextContent("No SKU");
  expect(card).toHaveTextContent("gid://shopify/Location/7");
  expect(screen.queryByRole("link", { name: "Open product in Shopify" })).toBeNull();
});

test.each(["managed", "linked"] as const)("edit inventory renders the saved %s binding using the production template", (mode) => {
  const template = readFileSync("src/components/windows/shopify/ShopifyLotManager.vue", "utf8").match(/<ShopifyBindingDetails\b[^>]*\/>/)?.[0];
  expect(template).toBeTruthy();
  const Harness = defineComponent({
    components: { ShopifyBindingDetails },
    template,
    setup: () => ({ t, listing: { mode, productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", productTitle: "Kaiju #8" } })
  });
  renderWithApp(Harness);
  expect(screen.getByTestId("shopify-binding-details")).toHaveTextContent("Kaiju #8");
});

test("shows a placeholder when no inventory location is stored", () => {
  renderDetails({ mode: "managed", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456" });
  expect(screen.getByTestId("shopify-binding-details")).toHaveTextContent("Unknown");
});

test.each([["DRAFT", "Draft"], ["ACTIVE", "Active"], ["ARCHIVED", "Archived"]] as const)("shows the current observed Shopify %s status", (productStatus, label) => {
  renderDetails({ mode: "linked", shop: "store.myshopify.com", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", productStatus });
  expect(screen.getByText(label)).toBeTruthy();
});

test.each([undefined, "PUBLISHED", "draft"] as const)("shows unavailable status for an absent or unrecognized provider status (%s)", (productStatus) => {
  renderDetails({ mode: "managed", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", productStatus: productStatus as never });
  expect(screen.getByText("Status unavailable")).toBeTruthy();
});
