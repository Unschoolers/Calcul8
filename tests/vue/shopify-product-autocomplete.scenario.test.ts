import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { expect, test, vi } from "vitest";
import ShopifyProductPicker from "../../src/components/windows/shopify/ShopifyProductPicker.vue";
import { configLotEditMethods } from "../../src/app-core/methods/config-lot-edit.ts";
import { renderWithApp } from "./render.ts";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("../../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse: apiCall }));

const longTitleProduct = {
  productId: "p1", variantId: "v1",
  title: "Dragon Shield Matte Sleeves for the Complete Collector Edition",
  variantTitle: "Midnight Black Premium Finish",
  sku: "DRAGON-MATTE-BLACK-COLLECTOR-EDITION-001",
  price: "12.00", inventoryItemId: "i1",
  locations: [{ id: "loc1", name: "Main Warehouse", available: 8 }, { id: "loc2", name: "Overflow Storage", available: 3 }]
};
const laterProduct = {
  ...longTitleProduct, productId: "p2", variantId: "v2", title: "Later page product",
  variantTitle: "Foil", sku: "LP-FOIL",
  locations: [{ id: "loc3", name: "Front", available: 4 }, { id: "loc4", name: "Back", available: 2 }]
};
const t = (key: string) => ({
  configShopifySearchLabel: "Product title, variant, or SKU",
  configShopifyNoResults: "No matching Shopify variants were found.",
  configShopifyLoadMore: "Load more",
  configShopifyLocationLabel: "Inventory location",
  configShopifyPickerTitle: "Choose a Shopify product",
  commonCancel: "Cancel",
  configShopifyUseProduct: "Use product",
  configShopifyPickerOpen: "Link existing product",
  configShopifyLinkTitle: "Link an existing Shopify variant",
  configShopifyBindingSku: "SKU",
  configShopifyBindingLocation: "Location",
  configShopifyPrice: "Price",
  configShopifySearching: "Searching Shopify products…",
  configShopifySearchResults: "Shopify product results",
  configShopifySearchMinimum: "Enter at least 2 characters to search."
}[key] ?? key);

test("picker renders readable multiline results and confirms selection without persisting a link", async () => {
  apiCall.mockImplementation(async (_ctx: unknown, path: string, init?: RequestInit) => new Response(JSON.stringify(
    JSON.parse(String(init?.body)).after
      ? { variants: [laterProduct], pageInfo: { hasNextPage: false, endCursor: null } }
      : { variants: [longTitleProduct], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } }
  ), { status: 200 }));
  const state = reactive({ activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 1, shopifyConnectionStatus: "connected", shopifyConnectionShop: "store-a.myshopify.com",
    currentLotId: 7, currentLotType: "bulk", showRenameLotModal: true, shopifyEditListing: null,
    shopifyEditSearchQuery: "", shopifyEditSearchResults: [] as typeof longTitleProduct[], shopifyEditSearchCursor: null as string | null,
    shopifyEditSearchHasMore: false, shopifyEditSearchCompleted: false, shopifyEditSelectedVariantId: null as string | null,
    shopifyEditSelectedLocationId: null as string | null, shopifyEditLoading: false, shopifyEditError: null as string | null,
    shopifyEditRequestRevision: 1, shopifyEditListingStatus: "loaded" as const, shopifyEditSessionAuthEpoch: 1,
    shopifyEditSessionScope: "{}", shopifyEditSessionLotId: 7, t });
  const searchProducts = (loadMore = false) => configLotEditMethods.searchShopifyEditProducts.call(state as never, loadMore);
  const onQueryChange = (value: string) => configLotEditMethods.onShopifyEditQueryChange.call(state as never, value);
  const selectVariant = (id: string) => configLotEditMethods.selectShopifyEditVariant.call(state as never, id);
  const selectLocation = (id: string) => configLotEditMethods.selectShopifyEditLocation.call(state as never, id);
  const Harness = defineComponent({ setup: () => () => h(ShopifyProductPicker, {
    query: state.shopifyEditSearchQuery, results: state.shopifyEditSearchResults, loading: state.shopifyEditLoading,
    completed: state.shopifyEditSearchCompleted, hasMore: state.shopifyEditSearchHasMore,
    selectedVariantId: state.shopifyEditSelectedVariantId, selectedLocationId: state.shopifyEditSelectedLocationId,
    error: state.shopifyEditError, disabled: false, t,
    onQueryChange, onLoadMore: () => searchProducts(true),
    onConfirm: (selection: { variantId: string; locationId: string }) => { selectVariant(selection.variantId); selectLocation(selection.locationId); }
  }) });
  renderWithApp(Harness);

  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  const search = await screen.findByRole("textbox", { name: "Product title, variant, or SKU" });
  expect(document.activeElement).not.toBe(search);
  await fireEvent.update(search, "d");
  expect(state.shopifyEditSearchQuery).toBe("d");
  expect(apiCall).not.toHaveBeenCalled();
  await fireEvent.update(search, "dragon sleeves");
  expect(state.shopifyEditSearchQuery).toBe("dragon sleeves");
  expect(screen.getByRole("button", { name: "Use product" })).toBeDisabled();
  await waitFor(() => expect(state.shopifyEditSearchResults).toHaveLength(1), { timeout: 1200 });
  expect(await screen.findByText(longTitleProduct.title)).toBeTruthy();
  expect(screen.getByText(longTitleProduct.variantTitle)).toBeTruthy();
  expect(screen.getByText(`SKU: ${longTitleProduct.sku}`)).toBeTruthy();
  expect(screen.getByText("Price: 12.00")).toBeTruthy();

  await fireEvent.click(screen.getByRole("button", { name: /Dragon Shield Matte Sleeves/ }));
  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: /Overflow Storage/ })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: /Overflow Storage/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(state.shopifyEditSearchResults).toHaveLength(2));
  expect(JSON.parse(String(apiCall.mock.calls.at(-1)?.[2]?.body)).after).toBe("cursor-1");
  await fireEvent.click(screen.getByRole("button", { name: "Use product" }));
  expect(state.shopifyEditSelectedVariantId).toBe("v1");
  expect(state.shopifyEditSelectedLocationId).toBe("loc2");
  expect(apiCall.mock.calls.every((call) => String(call[1]).endsWith("/products/search"))).toBe(true);
});

test("cancel restores the selection that was present when the picker opened", async () => {
  const restoreSelection = vi.fn();
  renderWithApp(ShopifyProductPicker, { props: {
    query: "dragon", results: [longTitleProduct], loading: false, completed: true, hasMore: false,
    selectedVariantId: "v1", selectedLocationId: "loc1", error: null, disabled: false, t,
    onCancel: restoreSelection
  } });
  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await screen.findByRole("dialog", { name: "Choose a Shopify product" });
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(restoreSelection).toHaveBeenCalledWith({ variantId: "v1", locationId: "loc1", product: longTitleProduct });
});
