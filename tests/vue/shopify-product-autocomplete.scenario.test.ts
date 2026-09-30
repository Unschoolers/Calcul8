import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { VAutocomplete, VBtn, VSelect } from "vuetify/components";
import { expect, test, vi } from "vitest";
import { configLotEditMethods } from "../../src/app-core/methods/config-lot-edit.ts";
import { renderWithApp } from "./render.ts";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("../../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse: apiCall }));

const product = {
  productId: "p1", variantId: "v1", title: "Dragon Shield Sleeves", variantTitle: "Matte Black",
  sku: "DS-MB", price: "12.00", inventoryItemId: "i1",
  locations: [{ id: "loc1", name: "Main", available: 8 }, { id: "loc2", name: "Overflow", available: 3 }]
};
const laterProduct = {
  ...product, productId: "p2", variantId: "v2", title: "Later page product", variantTitle: "Foil",
  sku: "LP-FOIL", locations: [{ id: "loc3", name: "Front", available: 4 }, { id: "loc4", name: "Back", available: 2 }]
};

test("autocomplete searches while typing, selects a variant and keeps location selection available", async () => {
  apiCall.mockImplementation(async (_ctx: unknown, path: string, init?: RequestInit) => path.endsWith("/listing")
    ? new Response(JSON.stringify({ listing: null }), { status: 200 })
    : new Response(JSON.stringify(JSON.parse(String(init?.body)).after
      ? { variants: [laterProduct], pageInfo: { hasNextPage: false, endCursor: null } }
      : { variants: [product], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } }), { status: 200 }));
  const state = reactive({
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 1, shopifyConnectionStatus: "connected", shopifyConnectionShop: "store-a.myshopify.com",
    currentLotId: 7, currentLotType: "bulk", currentTab: "config", lots: [], showRenameLotModal: true,
    shopifyEditListing: null, shopifyEditSearchQuery: "", shopifyEditSearchResults: [] as typeof product[],
    shopifyEditSearchCursor: null, shopifyEditSearchHasMore: false, shopifyEditSearchCompleted: false,
    shopifyEditSelectedVariantId: null as string | null, shopifyEditSelectedLocationId: null as string | null,
    shopifyEditLoading: false, shopifyEditSaving: false, shopifyEditError: null as string | null,
    shopifyEditRequestRevision: 1, shopifyEditListingStatus: "loaded" as const,
    shopifyEditSessionAuthEpoch: 1, shopifyEditSessionScope: "{}", shopifyEditSessionLotId: 7,
    t: (key: string) => key,
    searchShopifyEditProducts: (loadMore = false) => configLotEditMethods.searchShopifyEditProducts.call(state as never, loadMore),
    onShopifyEditQueryChange: (value: string) => configLotEditMethods.onShopifyEditQueryChange.call(state as never, value),
    selectShopifyEditVariant: (id: string) => configLotEditMethods.selectShopifyEditVariant.call(state as never, id),
    selectShopifyEditLocation: (id: string) => configLotEditMethods.selectShopifyEditLocation.call(state as never, id)
  });
  const Harness = defineComponent({
    setup: () => () => h("div", [
      h(VAutocomplete, {
        modelValue: state.shopifyEditSelectedVariantId,
        search: state.shopifyEditSearchQuery,
        items: state.shopifyEditSearchResults.map((item) => ({ title: `${item.title} · ${item.variantTitle} · ${item.sku} · ${item.price}`, value: item.variantId })),
        label: "Shopify product", noFilter: true, loading: state.shopifyEditLoading,
        "onUpdate:search": state.onShopifyEditQueryChange,
        "onUpdate:modelValue": (value: string | null) => state.selectShopifyEditVariant(value ?? "")
      }),
      state.shopifyEditSearchHasMore ? h(VBtn, {
        onClick: () => configLotEditMethods.searchShopifyEditProducts.call(state as never, true)
      }, () => "Load more") : null,
      state.shopifyEditSelectedVariantId ? h(VSelect, {
        label: "Location", items: state.shopifyEditSearchResults.find((item) => item.variantId === state.shopifyEditSelectedVariantId)?.locations.map((location) => ({ title: location.name, value: location.id })),
        "onUpdate:modelValue": state.selectShopifyEditLocation
      }) : null
    ])
  });
  renderWithApp(Harness);
  const input = screen.getByRole("combobox", { name: "Shopify product" });
  await fireEvent.update(input, "dragon");
  await waitFor(() => expect(apiCall.mock.calls.some((call) => String(call[1]).endsWith("/products/search"))).toBe(true), { timeout: 1200 });
  await waitFor(() => expect(state.shopifyEditSearchResults).toHaveLength(1));
  await fireEvent.click(input);
  await fireEvent.keyDown(input, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: /Dragon Shield Sleeves/ })).toBeTruthy());
  expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(state.shopifyEditSearchResults).toHaveLength(2));
  expect(JSON.parse(String(apiCall.mock.calls.at(-1)?.[2]?.body)).after).toBe("cursor-1");
  await fireEvent.click(input);
  await fireEvent.keyDown(input, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: /Later page product/ })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: /Later page product/ }));
  await waitFor(() => expect(state.shopifyEditSelectedVariantId).toBe("v2"));
  expect(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/products/search"))).toHaveLength(2);
  expect(screen.getByRole("combobox", { name: "Location" })).toBeTruthy();
  const locationInput = screen.getByRole("combobox", { name: "Location" });
  await fireEvent.click(locationInput);
  await fireEvent.keyDown(locationInput, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: "Back" })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: "Back" }));
  expect(state.shopifyEditSelectedLocationId).toBe("loc4");
});
