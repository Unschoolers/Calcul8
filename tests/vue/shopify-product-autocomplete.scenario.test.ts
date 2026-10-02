import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import ShopifyProductPicker from "../../src/components/windows/shopify/ShopifyProductPicker.vue";
import ShopifyLotIntegration from "../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import { configLotEditMethods } from "../../src/app-core/methods/config-lot-edit.ts";
import type { ShopifyDraftPreview } from "../../src/domain/shopify-draft.ts";
import type { ShopifyEditListing } from "../../src/types/app.ts";
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
  configShopifySectionTitle: "Shopify product",
  configShopifySearchLabel: "Product title, variant, or SKU",
  configShopifyNoResults: "No matching Shopify variants were found.",
  configShopifyLoadMore: "Load more",
  configShopifyLocationLabel: "Inventory location",
  configShopifyPickerTitle: "Choose a Shopify product",
  commonCancel: "Cancel",
  configShopifyUseProduct: "Use product",
  configShopifyPickerOpen: "Link existing product",
  configShopifyCreateDraft: "Create Shopify product",
  configShopifyDraftSaveFirst: "Save the lot name and SKU first. The draft uses saved inventory details.",
  configShopifyBindingSku: "SKU",
  configShopifyBindingLocation: "Location",
  configShopifyPrice: "Price",
  configShopifySearching: "Searching Shopify products…",
  configShopifySearchResults: "Shopify product results",
  configShopifySearchMinimum: "Enter at least 2 characters to search.",
  configShopifyReconnectInSettings: "Reconnect Shopify in Settings to continue.",
  configShopifyRetrySave: "Retry Save",
  configShopifyRefreshListing: "Refresh listing",
  configShopifyErrorUnauthorized: "Reconnect Shopify, then try again.",
  shopifyDraftDialogTitle: "Create Shopify draft",
  shopifyDraftCreate: "Create draft and link",
  shopifyDraftLoading: "Loading preview…",
  configShopifyErrorUnavailable: "Shopify is temporarily unavailable.",
  commonClose: "Close"
}[key] ?? key);

function renderAppShopifyEditHarness(initiallySelected = false, loadPreview: () => Promise<ShopifyDraftPreview> = async () => { throw new Error("unused"); }) {
  const source = readFileSync("src/App.html", "utf8");
  const integrationTag = source.match(/<shopify-lot-integration\b[\s\S]*?<\/shopify-lot-integration>/)?.[0];
  expect(integrationTag).toBeTruthy();
  const lot = { id: 41, name: "Old title", lotType: "bulk", externalSku: "OLD", whatnotVertical: "tcg", shopifyEnabled: false };
  const state = reactive({
    googleAuthEpoch: 1, activeScopeType: "personal", activeWorkspaceId: null, currentLotId: 41, currentLotType: "bulk", showRenameLotModal: true,
    shopifyConnectionShop: "store-a.myshopify.com", shopifyConnectionStatus: "connected", isOffline: false, isCurrentWorkspaceOwner: true,
    shopifyEditListing: null as ShopifyEditListing | null, shopifyEditListingStatus: "loaded", shopifyEditError: null as string | null, shopifyEditErrorOperation: null as "listing" | "search" | "link" | "create" | null, shopifyEditRecovery: "none" as const, shopifyEditSaving: false,
    shopifyEditSearchQuery: "dragon", shopifyEditSearchResults: [longTitleProduct], shopifyEditLoading: false, shopifyEditSearchCompleted: true,
    shopifyEditSearchHasMore: false, shopifyEditSearchCursor: null as string | null,
    shopifyEditSelectedVariantId: initiallySelected ? "v1" : null, shopifyEditSelectedLocationId: initiallySelected ? "loc1" : null,
    shopifyEditRequestRevision: 1, shopifyEditSessionAuthEpoch: 1, shopifyEditSessionScope: "{}", shopifyEditSessionLotId: 41,
    renameLotName: "Old title", renameLotExternalSku: "OLD", renameLotShopifyEnabled: false, renameLotWhatnotVertical: "tcg",
    boxesPurchased: 1, packsPerBox: 24, sales: [], preferredLanguage: "en", lots: [lot], t,
    onShopifyEditQueryChange(value: string) { return configLotEditMethods.onShopifyEditQueryChange.call(state as never, value); },
    searchShopifyEditProducts(loadMore = false) { return configLotEditMethods.searchShopifyEditProducts.call(state as never, loadMore); },
    selectShopifyEditVariant(variantId: string) { return configLotEditMethods.selectShopifyEditVariant.call(state as never, variantId); },
    selectShopifyEditLocation(locationId: string) { return configLotEditMethods.selectShopifyEditLocation.call(state as never, locationId); },
    restoreShopifyEditSelection(selection: unknown) {
      const restore = Reflect.get(configLotEditMethods, "restoreShopifyEditSelection") as (selection: unknown) => void;
      return restore.call(state, selection);
    },
    renameCurrentLot() { return configLotEditMethods.renameCurrentLot.call(state as never); },
    saveLotsToStorage() {},
    loadShopifyDraftPreview: loadPreview,
    createShopifyDraft(locationId: string, previewToken: string) { return configLotEditMethods.createShopifyDraft.call(state as never, locationId, previewToken); },
    refreshShopifyEditListing() { return configLotEditMethods.refreshShopifyEditListing.call(state as never); },
    loadShopifyLinkedStock: async () => { throw new Error("unused"); }
  });
  const Harness = defineComponent({
    components: { ShopifyLotIntegration },
    template: `<div>${integrationTag}<button type="button" @click="renameCurrentLot">Save lot</button></div>`,
    setup: () => state
  });
  return { state, ...renderWithApp(Harness) };
}

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
  expect(screen.getByText("Price: 12")).toBeTruthy();

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
  expect(restoreSelection).toHaveBeenCalledWith({ variantId: "v1", locationId: "loc1", product: longTitleProduct, query: "dragon" });
});

test("App cancellation restores an opening selection after query edits without restarting the root debounce, then Save links it", async () => {
  apiCall.mockClear();
  apiCall.mockImplementation(async (_ctx: unknown, path: string) => new Response(JSON.stringify(path.endsWith("/products/link")
    ? { listing: { mode: "linked", productId: "p1", variantId: "v1", locationId: "loc1" } }
    : { variants: [], pageInfo: { hasNextPage: false, endCursor: null } }), { status: 200 }));
  const { state } = renderAppShopifyEditHarness(true);

  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await fireEvent.update(screen.getByRole("textbox", { name: "Product title, variant, or SKU" }), "changed query");
  expect(state.shopifyEditSearchResults).toEqual([]);
  expect(state.shopifyEditSelectedVariantId).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await new Promise(resolve => setTimeout(resolve, 350));

  expect(state.shopifyEditSearchQuery).toBe("dragon");
  expect(state.shopifyEditSearchResults).toEqual([longTitleProduct]);
  expect(state.shopifyEditSelectedVariantId).toBe("v1");
  expect(state.shopifyEditSelectedLocationId).toBe("loc1");
  expect(apiCall.mock.calls.some(call => String(call[1]).endsWith("/products/search"))).toBe(false);

  await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  const linkCall = apiCall.mock.calls.find(call => String(call[1]).endsWith("/products/link"));
  expect(JSON.parse(String(linkCall?.[2]?.body))).toEqual({ lotId: 41, variantId: "v1", locationId: "loc1" });
});

test("empty-search Create closes the picker through snapshot restoration so cancelling preview keeps the pending link", async () => {
  apiCall.mockImplementation(async () => new Response(JSON.stringify({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } }), { status: 200 }));
  const loadPreview = vi.fn(() => new Promise<ShopifyDraftPreview>(() => undefined));
  const { state } = renderAppShopifyEditHarness(true, loadPreview);

  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await fireEvent.update(screen.getByRole("textbox", { name: "Product title, variant, or SKU" }), "new query");
  await waitFor(() => expect(state.shopifyEditSearchCompleted).toBe(true), { timeout: 1200 });
  expect(state.shopifyEditSearchResults).toEqual([]);
  expect(state.shopifyEditSelectedVariantId).toBeNull();
  const picker = screen.getByRole("dialog", { name: "Choose a Shopify product" });
  await fireEvent.click(within(picker).getByRole("button", { name: "Create Shopify product" }));
  await screen.findByText("Loading preview…");

  expect(state.shopifyEditSearchQuery).toBe("dragon");
  expect(state.shopifyEditSearchResults).toEqual([longTitleProduct]);
  expect(state.shopifyEditSelectedVariantId).toBe("v1");
  expect(state.shopifyEditSelectedLocationId).toBe("loc1");
  const previewDialog = screen.getByRole("dialog", { name: "Create Shopify draft" });
  const closeButtons = within(previewDialog).getAllByRole("button", { name: "Close" });
  await fireEvent.click(closeButtons[closeButtons.length - 1]!);
  expect(state.shopifyEditSelectedVariantId).toBe("v1");
  expect(loadPreview).toHaveBeenCalledOnce();
});

test("App parent Save link failure stays visible after the picker closes and guides Shopify reconnect", async () => {
  apiCall.mockImplementation(async () => new Response(JSON.stringify({ error: "provider details must stay hidden" }), { status: 401 }));
  renderAppShopifyEditHarness(false);

  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await fireEvent.click(screen.getByRole("button", { name: /Dragon Shield Matte Sleeves/ }));
  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: /Main Warehouse/ })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: /Main Warehouse/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Use product" }));
  expect(screen.queryByRole("dialog", { name: "Choose a Shopify product" })?.querySelector(".v-overlay__content")?.getAttribute("style")).toContain("display: none");

  await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Reconnect Shopify, then try again.");
  expect(alert).toHaveTextContent("Reconnect Shopify in Settings to continue.");
  expect(alert).not.toHaveTextContent("provider details must stay hidden");
});

test("App link conflict can refresh the authoritative listing and save preserved lot metadata without relinking", async () => {
  apiCall.mockClear();
  const listing = { mode: "linked", shop: "store-a.myshopify.com", productId: "gid://shopify/Product/22", variantId: "gid://shopify/ProductVariant/33", inventoryItemId: "gid://shopify/InventoryItem/44", locationId: "gid://shopify/Location/55", productTitle: "Already linked product" };
  apiCall.mockImplementation(async (_ctx: unknown, path: string) => path.endsWith("/products/link")
    ? new Response(JSON.stringify({ error: "Variant is already linked" }), { status: 409 })
    : new Response(JSON.stringify({ listing }), { status: 200 }));
  const { state } = renderAppShopifyEditHarness(true);

  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await fireEvent.click(screen.getByRole("button", { name: /Dragon Shield Matte Sleeves/ }));
  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: /Main Warehouse/ })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: /Main Warehouse/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Use product" }));
  expect(state.shopifyEditListing).toBeNull();
  expect(state.shopifyEditListingStatus).toBe("loaded");
  expect(state.shopifyEditSelectedVariantId).toBe("v1");
  expect(state.shopifyEditSelectedLocationId).toBe("loc1");
  state.renameLotExternalSku = "NEW-SKU";

  await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  await waitFor(() => expect(state.shopifyEditErrorOperation).toBe("link"));
  expect(state.shopifyEditRecovery).toBe("refresh");
  await fireEvent.click(screen.getByRole("button", { name: "Refresh listing" }));
  await waitFor(() => expect(apiCall.mock.calls.some(call => String(call[1]).endsWith("/products/listing"))).toBe(true));
  await waitFor(() => expect(state.shopifyEditListing?.productId).toBe(listing.productId));
  expect(state.renameLotExternalSku).toBe("NEW-SKU");

  await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  expect(state.lots[0]?.externalSku).toBe("NEW-SKU");
  expect(state.shopifyEditSelectedVariantId).toBeNull();
  expect(state.shopifyEditSelectedLocationId).toBeNull();
  expect(apiCall.mock.calls.filter(call => String(call[1]).endsWith("/products/link"))).toHaveLength(1);
  expect(apiCall.mock.calls.some(call => String(call[1]).endsWith("/products/create"))).toBe(false);
});

test("closing a failed draft preview never offers parent Save retry for the restored existing-product selection", async () => {
  apiCall.mockClear();
  apiCall.mockImplementation(async (_ctx: unknown, path: string) => {
    if (path.endsWith("/products/search")) return new Response(JSON.stringify({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } }), { status: 200 });
    if (path.endsWith("/products/create")) return new Response(JSON.stringify({ error: "temporary failure" }), { status: 503 });
    return new Response(JSON.stringify({ preview: {
      title: "New draft", variantTitle: "Default Title", sku: "OLD", price: "12.00", currency: "USD", quantity: 1,
      locations: [{ id: "gid://shopify/Location/123", name: "Main Warehouse" }], previewToken: "b".repeat(64)
    } }), { status: 200 });
  });
  const preview = {
    title: "New draft", variantTitle: "Default Title", sku: "OLD", price: "12.00", currency: "USD", quantity: 1,
    locations: [{ id: "gid://shopify/Location/123", name: "Main Warehouse" }], previewToken: "b".repeat(64)
  } satisfies ShopifyDraftPreview;
  const { state } = renderAppShopifyEditHarness(true, async () => preview);

  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await fireEvent.update(screen.getByRole("textbox", { name: "Product title, variant, or SKU" }), "new query");
  await waitFor(() => expect(state.shopifyEditSearchCompleted).toBe(true), { timeout: 1200 });
  const picker = screen.getByRole("dialog", { name: "Choose a Shopify product" });
  await fireEvent.click(within(picker).getByRole("button", { name: "Create Shopify product" }));
  await screen.findByRole("dialog", { name: "Create Shopify draft" });
  await fireEvent.click(screen.getByRole("button", { name: "Create draft and link" }));
  await waitFor(() => expect(apiCall.mock.calls.some(call => String(call[1]).endsWith("/products/create"))).toBe(true));
  await waitFor(() => expect(state.shopifyEditError).not.toBeNull());
  expect(state.shopifyEditErrorOperation).toBe("create");
  expect(state.shopifyEditSelectedVariantId).toBe("v1");
  expect(state.shopifyEditSelectedLocationId).toBe("loc1");

  const previewDialog = screen.getByRole("dialog", { name: "Create Shopify draft" });
  const closeButtons = within(previewDialog).getAllByRole("button", { name: "Close" });
  await fireEvent.click(closeButtons[closeButtons.length - 1]!);

  expect(screen.queryByRole("button", { name: "Retry Save" })).toBeNull();
  expect(apiCall.mock.calls.some(call => String(call[1]).endsWith("/products/link"))).toBe(false);
});

test("draft creation is a separate action and closing its dialog preserves a pending existing-product selection", async () => {
  const selected = { variantId: "v1" as string | null, locationId: "loc2" as string | null };
  const labels: Record<string, string> = {
    configShopifySectionTitle: "Shopify product",
    configShopifyCreateDraft: "Create Shopify product",
    configShopifyDraftSaveFirst: "Save the lot name and SKU first. The draft uses saved inventory details.",
    shopifyDraftDialogTitle: "Create Shopify draft",
    shopifyDraftLoading: "Loading authoritative preview…",
    commonClose: "Close"
  };
  const tWithDraft = (key: string) => labels[key] ?? t(key);
  const loadDraftPreview = vi.fn(async () => ({
    title: "Draft", variantTitle: "Sealed box", sku: "DRAFT", price: "2.00", currency: "CAD", quantity: 1,
    locations: [{ id: "gid://shopify/Location/1", name: "Main" }], previewToken: "a".repeat(64)
  }));
  const Harness = defineComponent({ setup: () => () => h(ShopifyProductPicker, {
    query: "dragon sleeves", results: [longTitleProduct], loading: false, completed: true, hasMore: false,
    selectedVariantId: selected.variantId, selectedLocationId: selected.locationId, error: null, disabled: false, t: tWithDraft,
    canCreateDraft: true, loadDraftPreview, createDraft: async () => undefined,
    onConfirm: (value: { variantId: string; locationId: string }) => Object.assign(selected, value)
  }) });
  renderWithApp(Harness);

  expect(screen.getByRole("button", { name: "Create Shopify product" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await screen.findByRole("dialog", { name: "Choose a Shopify product" });
  await fireEvent.click(screen.getByRole("button", { name: /Dragon Shield Matte Sleeves/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Use product" }));
  expect(selected).toEqual({ variantId: "v1", locationId: "loc2" });

  await fireEvent.click(screen.getByRole("button", { name: "Create Shopify product" }));
  expect(await screen.findByText("Draft")).toBeTruthy();
  const draftDialog = screen.getByRole("dialog", { name: "Create Shopify draft" });
  await fireEvent.click(within(draftDialog).getAllByRole("button", { name: "Close" })[1]!);
  expect(selected).toEqual({ variantId: "v1", locationId: "loc2" });
  expect(loadDraftPreview).toHaveBeenCalledOnce();
});
