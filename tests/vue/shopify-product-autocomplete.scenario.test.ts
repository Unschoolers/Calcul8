import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import ShopifyProductPicker from "../../src/components/windows/shopify/ShopifyProductPicker.vue";
import ShopifyLotIntegration from "../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import { configLotEditMethods } from "../../src/app-core/methods/config-lot-edit.ts";
import type { BindingAction, BindingMutation, ProductDetailsDraft, ProductDetailsResult, DraftCreateMutation, ProductDetailsMutation } from "../../shared/shopify-product-manager.ts";
import type { ShopifyDraftPreview } from "../../src/domain/shopify-draft.ts";
import type { ShopifyEditListing } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("../../src/app-core/methods/ui/common/api-client.ts", () => ({
  fetchAuthenticatedApiResponse: apiCall,
  isApiRequestAborted: (error: unknown) => error instanceof DOMException && error.name === "AbortError"
}));

const longTitleProduct = {
  productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/1",
  title: "Dragon Shield Matte Sleeves for the Complete Collector Edition",
  variantTitle: "Midnight Black Premium Finish",
  sku: "DRAGON-MATTE-BLACK-COLLECTOR-EDITION-001",
  price: "12.00", inventoryItemId: "gid://shopify/InventoryItem/1",
  locations: [{ id: "gid://shopify/Location/1", name: "Main Warehouse", available: 8 }, { id: "gid://shopify/Location/2", name: "Overflow Storage", available: 3 }]
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
    shopifyEditSelectedVariantId: initiallySelected ? "gid://shopify/ProductVariant/1" : null, shopifyEditSelectedLocationId: initiallySelected ? "gid://shopify/Location/1" : null,
    shopifyEditRequestRevision: 1, shopifyEditSessionAuthEpoch: 1, shopifyEditSessionScope: "{}", shopifyEditSessionLotId: 41,
    shopifyEditManagerOpen: false, shopifyEditBindingVersion: null as string | null, shopifyEditGeneration: 2,
    shopifyEditDetailsOutcome: null as ProductDetailsResult['outcome'] | null, shopifyEditPendingOwnerScope: null as string | null,
    shopifyEditOperationId: null as string | null, shopifyEditPendingBindingMutation: null as BindingMutation | null,
    shopifyEditPendingDetailsMutation: null as ProductDetailsMutation | null, shopifyEditPendingCreateMutation: null as DraftCreateMutation | null,
    refreshShopifyBindings: vi.fn(async () => {}),
    applyShopifyBinding(action: BindingAction, selection?: { variantId?: string; locationId?: string; confirmTransfer?: boolean }) { return configLotEditMethods.applyShopifyBinding.call(state as never, action, selection); },
    saveShopifyBinding(request: BindingMutation) { return configLotEditMethods.saveShopifyBinding.call(state as never, request); },
    saveShopifyProductDetails(draft: ProductDetailsDraft) { return configLotEditMethods.saveShopifyProductDetails.call(state as never, draft); },
    resetShopifyEditor() { return configLotEditMethods.resetShopifyEditor.call(state as never); },
    renameLotImage: "", renameLotImageBusy: false, renameLotName: "Old title", renameLotExternalSku: "OLD", renameLotShopifyEnabled: false, renameLotWhatnotVertical: "tcg",
    boxesPurchased: 1, packsPerBox: 24, sales: [], preferredLanguage: "en", lots: [lot], getSavedCurrentLot: () => lot, t,
    onShopifyEditQueryChange(value: string) { return configLotEditMethods.onShopifyEditQueryChange.call(state as never, value); },
    searchShopifyEditProducts(loadMore = false) { return configLotEditMethods.searchShopifyEditProducts.call(state as never, loadMore); },
    selectShopifyEditVariant(variantId: string) { return configLotEditMethods.selectShopifyEditVariant.call(state as never, variantId); },
    selectShopifyEditLocation(locationId: string) { return configLotEditMethods.selectShopifyEditLocation.call(state as never, locationId); },
    restoreShopifyEditSelection(selection: unknown) {
      const restore = Reflect.get(configLotEditMethods, "restoreShopifyEditSelection") as (selection: unknown) => void;
      return restore.call(state, selection);
    },
    renameCurrentLot() { return configLotEditMethods.renameCurrentLot.call(state as never); },
    saveLotsToStorage() {}, notify() {}, currentTab: "config",
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
  expect(state.shopifyEditSelectedVariantId).toBe("gid://shopify/ProductVariant/1");
  expect(state.shopifyEditSelectedLocationId).toBe("gid://shopify/Location/2");
  expect(apiCall.mock.calls.every((call) => String(call[1]).endsWith("/products/search"))).toBe(true);
});

test("cancel restores the selection that was present when the picker opened", async () => {
  const restoreSelection = vi.fn();
  renderWithApp(ShopifyProductPicker, { props: {
    query: "dragon", results: [longTitleProduct], loading: false, completed: true, hasMore: false,
    selectedVariantId: "gid://shopify/ProductVariant/1", selectedLocationId: "gid://shopify/Location/1", error: null, disabled: false, t,
    onCancel: restoreSelection
  } });
  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await screen.findByRole("dialog", { name: "Choose a Shopify product" });
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(restoreSelection).toHaveBeenCalledWith({ variantId: "gid://shopify/ProductVariant/1", locationId: "gid://shopify/Location/1", product: longTitleProduct, query: "dragon" });
});

async function openManager() { await fireEvent.click(screen.getByRole("button", { name: "configShopifyManageProduct" })); }
async function chooseCurrentProduct() {
  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  await fireEvent.click(screen.getByRole("button", { name: /Dragon Shield Matte Sleeves/ }));
  const location = await screen.findByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await fireEvent.click(await screen.findByRole("option", { name: /Main Warehouse/ }));
}

test("App cancellation and inventory Save never persist a proposed Shopify selection", async () => {
  apiCall.mockClear();
  const { state } = renderAppShopifyEditHarness(true);
  state.renameLotName = "Unsaved inventory name";
  await openManager(); await chooseCurrentProduct();
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(state.renameLotName).toBe("Unsaved inventory name");
  await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  expect(state.lots[0]?.name).toBe("Unsaved inventory name");
  expect(apiCall).not.toHaveBeenCalled();
});

test("closing a loading draft preview preserves inventory fields without creating a product", async () => {
  apiCall.mockClear();
  const loadPreview = vi.fn(() => new Promise<ShopifyDraftPreview>(() => undefined));
  const { state } = renderAppShopifyEditHarness(false, loadPreview);
  await openManager(); await fireEvent.click(screen.getByRole("button", { name: "Create Shopify product" }));
  await screen.findByText("Loading preview…");
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(state.renameLotName).toBe("Old title"); expect(state.renameLotExternalSku).toBe("OLD");
  expect(state.shopifyEditManagerOpen).toBe(false); expect(loadPreview).toHaveBeenCalledOnce(); expect(apiCall).not.toHaveBeenCalled();
});

test("an explicit link authorization failure stays in the manager with reconnect guidance", async () => {
  apiCall.mockClear(); apiCall.mockImplementation(async () => new Response(JSON.stringify({ error: "provider details must stay hidden" }), { status: 401 }));
  const { state } = renderAppShopifyEditHarness(); await openManager(); await chooseCurrentProduct();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmLink" }));
  await waitFor(() => expect(state.shopifyEditError).toBe("Reconnect Shopify, then try again."));
  const alert = screen.getAllByRole("alert").find(item => item.textContent?.includes("Reconnect Shopify, then try again."));
  expect(alert).toBeDefined();
  expect(screen.getAllByText("Reconnect Shopify in Settings to continue.").length).toBeGreaterThan(0);
  expect(alert).not.toHaveTextContent("provider details must stay hidden");
  expect(state.showRenameLotModal).toBe(true);
  expect(apiCall.mock.calls.filter(call => String(call[1]).endsWith("/products/binding"))).toHaveLength(1);
});

test("a rejected duplicate link can refresh current binding while preserving inventory metadata", async () => {
  apiCall.mockClear();
  const listing = { mode: "linked", shop: "store-a.myshopify.com", scopeKey: "u", lotId: 41, productId: "gid://shopify/Product/22", variantId: "gid://shopify/ProductVariant/33", inventoryItemId: "gid://shopify/InventoryItem/44", locationId: "gid://shopify/Location/55", productTitle: "Already linked product", lastQuantity: 1, updatedAt: "now" };
  apiCall.mockImplementation(async (_ctx: unknown, path: string) => path.endsWith("/products/binding")
    ? new Response(JSON.stringify({ code: "SHOPIFY_VARIANT_ALREADY_BOUND" }), { status: 409 })
    : new Response(JSON.stringify({ listing, bindingVersion: "v2", generation: 2, shop: listing.shop }), { status: 200 }));
  const { state } = renderAppShopifyEditHarness(); state.renameLotExternalSku = "NEW-SKU";
  await openManager(); await chooseCurrentProduct(); await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmLink" }));
  await waitFor(() => expect(state.shopifyEditRecovery).toBe("refresh"));
  await waitFor(() => expect(screen.getByRole("button", { name: "configShopifyBack" })).toBeEnabled());
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyBack" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Refresh listing" }));
  await waitFor(() => expect(state.shopifyEditListing?.productId).toBe(listing.productId));
  expect(state.renameLotExternalSku).toBe("NEW-SKU");
  await fireEvent.click(screen.getByRole("button", { name: "Close" })); await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  expect(state.lots[0]?.externalSku).toBe("NEW-SKU");
  expect(apiCall.mock.calls.filter(call => String(call[1]).endsWith("/products/binding"))).toHaveLength(1);
});

test("an ambiguous draft attempt remains recoverable after closing the manager and never turns into an inventory Save link", async () => {
  apiCall.mockClear(); apiCall.mockImplementation(async () => new Response(JSON.stringify({ error: "temporary failure" }), { status: 503 }));
  const preview = { title: "New draft", variantTitle: "Booster box", sku: "OLD", price: "12.00", currency: "USD", quantity: 1, locations: [{ id: "gid://shopify/Location/123", name: "Main Warehouse" }], previewToken: "b".repeat(64) } satisfies ShopifyDraftPreview;
  const { state } = renderAppShopifyEditHarness(false, async () => preview);
  await openManager(); await fireEvent.click(screen.getByRole("button", { name: "Create Shopify product" }));
  await screen.findByRole("textbox", { name: "shopifyDraftTitleLabel" });
  await fireEvent.click(screen.getByRole("button", { name: "Create draft and link" }));
  await waitFor(() => expect(state.shopifyEditPendingCreateMutation).not.toBeNull());
  await waitFor(() => expect(state.shopifyEditSaving).toBe(false));
  await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toBeEnabled());
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await screen.findByText("configShopifyRetainAttemptHint");
  const close = screen.getAllByRole("button", { name: "Close" }); await fireEvent.click(close[close.length - 1]!);
  await waitFor(() => expect(state.shopifyEditManagerOpen).toBe(false));
  expect(state.shopifyEditPendingCreateMutation).not.toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Save lot" }));
  expect(apiCall.mock.calls.filter(call => String(call[1]).endsWith("/products/create"))).toHaveLength(1);
  expect(apiCall.mock.calls.some(call => String(call[1]).endsWith("/products/binding") || String(call[1]).endsWith("/products/link"))).toBe(false);
});

test("draft creation is a separate action and closing its dialog preserves a pending existing-product selection", async () => {
  const selected = { variantId: "gid://shopify/ProductVariant/1" as string | null, locationId: "gid://shopify/Location/2" as string | null };
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
  expect(selected).toEqual({ variantId: "gid://shopify/ProductVariant/1", locationId: "gid://shopify/Location/2" });

  await fireEvent.click(screen.getByRole("button", { name: "Create Shopify product" }));
  expect(await screen.findByText("Draft")).toBeTruthy();
  const draftDialog = screen.getByRole("dialog", { name: "Create Shopify draft" });
  await fireEvent.click(within(draftDialog).getAllByRole("button", { name: "Close" })[1]!);
  expect(selected).toEqual({ variantId: "gid://shopify/ProductVariant/1", locationId: "gid://shopify/Location/2" });
  expect(loadDraftPreview).toHaveBeenCalledOnce();
});
