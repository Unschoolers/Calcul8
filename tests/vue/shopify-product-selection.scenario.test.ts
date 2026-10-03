import { fireEvent, screen } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import ShopifyProductSelection from "../../src/components/windows/shopify/ShopifyProductSelection.vue";
import { renderWithApp } from "./render.ts";

const product = { productId: "p", variantId: "v", inventoryItemId: "i", title: "A very long product name", variantTitle: "Booster box", sku: "BOX", price: "23.00", locations: [{ id: "loc", name: "Main", available: 3 }] };
test("selection body proposes a product without mounting another dialog or making a mutation", async () => {
  const selection = vi.fn();
  renderWithApp(ShopifyProductSelection, { props: { query: "Booster", results: [product], loading: false, completed: true, hasMore: false, selectedVariantId: null, selectedLocationId: null, error: null, disabled: false, t: (key: string) => key, onSelection: selection } });
  await fireEvent.click(screen.getByRole("button", { name: /A very long product name/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(selection).toHaveBeenCalledWith({ variantId: "v", locationId: "loc", product });
  // The reusable body emits selection; the manager owns the explicit Link/Replace action.
  expect(screen.queryByRole("button", { name: "configShopifyUseProduct" })).toBeNull();
});
test("selection body exposes reconnect recovery and disables proposal controls for a member", () => {
  renderWithApp(ShopifyProductSelection, { props: { query: "Booster", results: [product], loading: false, completed: true, hasMore: false, selectedVariantId: null, selectedLocationId: null, error: "Access expired", recovery: "reconnect", disabled: true, t: (key: string) => key } });
  expect(screen.getByText("configShopifyReconnectInSettings")).toBeTruthy();
  expect(screen.getByRole("button", { name: /A very long product name/ })).toBeDisabled();
});
