import { render, screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { defineComponent } from "vue";
import ShopifyBindingDetails from "../../src/components/windows/shopify/ShopifyBindingDetails.vue";
import type { ShopifyEditListing } from "../../src/types/app.ts";

const t = (key: string) => ({ configShopifyBindingProduct: "Product", configShopifyBindingVariant: "Variant", configShopifyBindingSku: "SKU", configShopifyBindingLocation: "Inventory location", configShopifyNoSku: "No SKU", configShopifyUnknownLocation: "Unknown", configShopifyOpenProduct: "Open product in Shopify" })[key] ?? key;

function renderDetails(listing: ShopifyEditListing) {
  return render(ShopifyBindingDetails, { props: { listing, t } });
}

test.each(["managed", "linked"] as const)("shows %s binding details and safe admin link", (mode) => {
  renderDetails({ mode, shop: "store-a.myshopify.com", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", productTitle: "Booster Box", variantTitle: "Display", sku: "BOX-1", locationId: "gid://shopify/Location/7", locationName: "Main" });
  expect(screen.getByText("Product:").parentElement).toHaveTextContent("Booster Box");
  expect(screen.getByText("Variant:").parentElement).toHaveTextContent("Display");
  expect(screen.getByText("SKU:").parentElement).toHaveTextContent("BOX-1");
  expect(screen.getByText("Inventory location:").parentElement).toHaveTextContent("Main");
  expect(screen.getByRole("link", { name: "Open product in Shopify" })).toHaveAttribute("href", "https://store-a.myshopify.com/admin/products/123");
});

test("falls back to stored IDs and omits an unsafe admin link", () => {
  renderDetails({ mode: "managed", shop: "store.myshopify.com.evil.example", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", locationId: "gid://shopify/Location/7" });
  expect(screen.getByText("Product:").parentElement).toHaveTextContent("gid://shopify/Product/123");
  expect(screen.getByText("Variant:").parentElement).toHaveTextContent("gid://shopify/ProductVariant/456");
  expect(screen.getByText("SKU:").parentElement).toHaveTextContent("No SKU");
  expect(screen.getByText("Inventory location:").parentElement).toHaveTextContent("gid://shopify/Location/7");
  expect(screen.queryByRole("link", { name: "Open product in Shopify" })).toBeNull();
});

test.each(["managed", "linked"] as const)("edit inventory renders the saved %s binding using the production template", (mode) => {
  const template = readFileSync("src/App.html", "utf8").match(/<shopify-binding-details\b[^>]*\/>/)?.[0];
  expect(template).toBeTruthy();
  const Harness = defineComponent({
    components: { ShopifyBindingDetails },
    template,
    setup: () => ({ t, shopifyEditListing: { mode, productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456", productTitle: "Kaiju #8" } })
  });
  render(Harness);
  expect(screen.getByText("Product:").parentElement).toHaveTextContent("Kaiju #8");
});

test("shows a placeholder when no inventory location is stored", () => {
  renderDetails({ mode: "managed", productId: "gid://shopify/Product/123", variantId: "gid://shopify/ProductVariant/456" });
  expect(screen.getByText("Inventory location:").parentElement).toHaveTextContent("Unknown");
});
