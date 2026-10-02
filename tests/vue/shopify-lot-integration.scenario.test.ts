import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import { reactive } from "vue";
import ShopifyLotIntegration from "../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import type { ShopifyLotIntegrationProps } from "../../src/domain/shopify-lot-integration.ts";
import type { ShopifyEditListing } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

const t = (key: string) => ({
  configShopifySectionTitle: "Shopify product",
  configShopifyPickerOpen: "Link existing product",
  configShopifyCreateDraft: "Create Shopify product",
  configShopifyDraftSaveFirst: "Save the lot name and SKU first. The draft uses saved inventory details.",
  configShopifyWorkspaceOwnerHint: "Ask the workspace owner to link Shopify products.",
  configShopifyDraftCreated: "Draft created and linked.",
  configShopifyReconnectInSettings: "Reconnect Shopify in Settings to continue.",
  configShopifyRetrySave: "Retry Save",
  shopifyDraftCreate: "Create draft and link",
  shopifyDraftDialogTitle: "Create a Shopify draft",
  shopifyDraftLocationLabel: "Inventory location"
}[key] ?? key);

function integrationProps(overrides: Partial<ShopifyLotIntegrationProps> = {}): ShopifyLotIntegrationProps {
  return {
    state: {
      listing: null, listingStatus: "loaded", error: null, errorOperation: null, recovery: "none", saving: false,
      search: { query: "", results: [], loading: false, completed: false, hasMore: false, selectedVariantId: null, selectedLocationId: null }
    },
    lot: { type: "bulk", saved: { name: "Saved lot", externalSku: "SKU-1" }, draftName: "Edited lot", draftSku: "SKU-1", boxesPurchased: 1, packsPerBox: 24, sales: [] },
    connection: { status: "connected", shop: "store.myshopify.com", offline: false, canManage: true },
    language: "en", t,
    callbacks: { loadPreview: vi.fn(async () => { throw new Error("unused"); }), createDraft: vi.fn(async () => undefined), refreshListing: vi.fn(async () => undefined), loadStock: vi.fn(async () => { throw new Error("unused"); }) },
    ...overrides
  };
}

test("keeps draft creation visible but disabled while saved lot details are dirty", async () => {
  renderWithApp(ShopifyLotIntegration, { props: integrationProps() });
  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  const create = await screen.findByRole("button", { name: "Create Shopify product" });
  expect(create.hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("Save the lot name and SKU first. The draft uses saved inventory details.")).toBeTruthy();
});

test("gives workspace members owner guidance and disables Shopify linking", async () => {
  renderWithApp(ShopifyLotIntegration, { props: integrationProps({ connection: { status: "connected", shop: "store.myshopify.com", offline: false, canManage: false } }) });
  expect(screen.getByText("Ask the workspace owner to link Shopify products.")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Link existing product" }));
  expect(screen.getByRole("button", { name: "Link existing product" })).toBeDisabled();
});

test("shows reconnect guidance for a failed parent Save after the picker has closed", () => {
  const props = integrationProps({
    state: {
      listing: null, listingStatus: "loaded", error: "Shopify authorization expired.", errorOperation: "link", recovery: "reconnect", saving: false,
      search: { query: "dragon", results: [], loading: false, completed: true, hasMore: false, selectedVariantId: "v1", selectedLocationId: "l1" }
    }
  });
  renderWithApp(ShopifyLotIntegration, { props });

  expect(screen.getByRole("alert")).toHaveTextContent("Shopify authorization expired.");
  expect(screen.getByText("Reconnect Shopify in Settings to continue.")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry Save" })).toBeNull();
});

test("offers an explicit parent Save retry for a recoverable link failure", async () => {
  const onRetrySave = vi.fn();
  const props = integrationProps({
    state: {
      listing: null, listingStatus: "loaded", error: "Shopify is temporarily unavailable.", errorOperation: "link", recovery: "retry", saving: false,
      search: { query: "dragon", results: [], loading: false, completed: true, hasMore: false, selectedVariantId: "v1", selectedLocationId: "l1" }
    }
  });
  renderWithApp(ShopifyLotIntegration, { props: { ...props, onRetrySave } });

  expect(screen.getByRole("alert")).toHaveTextContent("Shopify is temporarily unavailable.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry Save" }));
  expect(onRetrySave).toHaveBeenCalledOnce();
});

test("reloads stock for a changed Shopify variant or location", async () => {
  const state = reactive({
    listing: { mode: "linked" as const, productId: "p1", variantId: "v1", locationId: "l1", inventoryItemId: "i1" },
    listingStatus: "loaded" as const, error: null, errorOperation: null, recovery: "none" as const, saving: false,
    search: { query: "", results: [], loading: false, completed: false, hasMore: false, selectedVariantId: null, selectedLocationId: null }
  });
  const loadStock = vi.fn(async () => { throw new Error("offline"); });
  renderWithApp(ShopifyLotIntegration, { props: integrationProps({ state, callbacks: { ...integrationProps().callbacks, loadStock } }) });
  await waitFor(() => expect(loadStock).toHaveBeenCalledTimes(1));
  state.listing = { ...state.listing, variantId: "v2", locationId: "l2", inventoryItemId: "i2" };
  await waitFor(() => expect(loadStock).toHaveBeenCalledTimes(2));
});

test("keeps stock loading gated from immediate mapping through post-create listing refresh", async () => {
  const listing: ShopifyEditListing = { mode: "linked", shop: "store.myshopify.com", productId: "gid://shopify/Product/77", variantId: "gid://shopify/ProductVariant/88", productTitle: "Created product" };
  let resolveCreate!: () => void;
  let resolveRefresh!: () => void;
  const state = reactive({
    listing: null as ShopifyEditListing | null, listingStatus: "loaded" as const, error: null, errorOperation: null, recovery: "none" as const, saving: false,
    search: { query: "", results: [], loading: false, completed: false, hasMore: false, selectedVariantId: null, selectedLocationId: null }
  });
  const loadStock = vi.fn(async () => { throw new Error("should wait until refresh ends"); });
  const refreshListing = vi.fn(() => new Promise<void>(resolve => { resolveRefresh = resolve; }));
  const props = integrationProps({
    state,
    lot: { type: "bulk", saved: { name: "Saved lot", externalSku: "SKU-1" }, draftName: "Saved lot", draftSku: "SKU-1", boxesPurchased: 1, packsPerBox: 24, sales: [] },
    callbacks: {
      loadPreview: async () => ({ title: "Created product", variantTitle: "Box", sku: "SKU-1", price: "20.00", currency: "CAD", quantity: 1, locations: [{ id: "gid://shopify/Location/1", name: "Main", available: 1 }], previewToken: "a".repeat(64) }),
      createDraft: vi.fn(() => { state.listing = listing; return new Promise<void>(resolve => { resolveCreate = resolve; }); }),
      refreshListing,
      loadStock
    }
  });
  const created = vi.fn();
  renderWithApp(ShopifyLotIntegration, { props: { ...props, onCreated: created } });

  await fireEvent.click(screen.getByRole("button", { name: "Create Shopify product" }));
  await screen.findByText("Created product");
  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: "Main" })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: "Main" }));
  await fireEvent.click(screen.getByRole("button", { name: "Create draft and link" }));

  await screen.findByTestId("shopify-binding-details");
  expect(loadStock).not.toHaveBeenCalled();
  resolveCreate();
  await waitFor(() => expect(refreshListing).toHaveBeenCalledOnce());
  expect(loadStock).not.toHaveBeenCalled();
  resolveRefresh();
  await waitFor(() => expect(loadStock).toHaveBeenCalledOnce());
  expect(created).toHaveBeenCalledOnce();
  expect(screen.getByText("Draft created and linked.")).toBeTruthy();
});
