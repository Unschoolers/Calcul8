import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import { reactive, defineComponent, ref } from "vue";
import ShopifyLotIntegration from "../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import AppDialogShell from "../../src/components/ui/AppDialogShell.vue";
import type { ShopifyLotIntegrationProps } from "../../src/domain/shopify-lot-integration.ts";
import { renderWithApp } from "./render.ts";
const location = "gid://shopify/Location/4";
const listing = { mode: "linked" as const, shop: "store.myshopify.com", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: location, locationName: "Main", productTitle: "Store title", variantTitle: "Booster box", price: "20.00", currency: "CAD", observedAt: "2026-10-03T10:00:00Z", availableLocations: [{ id: location, name: "Main" }] };
function scenario(linked = false) {
  const state = reactive<ShopifyLotIntegrationProps['state']>({ listing: linked ? { ...listing } : null, listingStatus: "loaded", bindingVersion: "v1", generation: 2, error: null, errorOperation: null, recovery: "none", saving: false, search: { query: "box", results: [{ ...listing, title: "Store title", sku: "SKU", locations: [{ id: location, name: "Main", available: 3 }] }], loading: false, completed: true, hasMore: false, selectedVariantId: null, selectedLocationId: null } });
  const saveBinding = vi.fn(async (action: string) => { state.listing = action === "unlink" ? null : { ...listing }; return { listing: null, bindingVersion: "v2" }; });
  const saveDetails = vi.fn(async () => ({ listing: null, bindingVersion: "v1", outcome: { title: "confirmed" as const, price: "confirmed" as const } }));
  const loadStock = vi.fn(async () => { throw new Error("offline"); });
  const props: ShopifyLotIntegrationProps = { state, lot: { type: "bulk", saved: { name: "Inventory", externalSku: "SKU" }, draftName: "Inventory", draftSku: "SKU", boxesPurchased: 3, packsPerBox: 24, sales: [] }, connection: { status: "connected", shop: listing.shop, offline: false, canManage: true }, language: "en", t: key => key, callbacks: { loadPreview: vi.fn(async () => { throw new Error("unused"); }), createDraft: vi.fn(async () => {}), refreshListing: vi.fn(async () => {}), loadStock, saveBinding, saveDetails } };
  return { props, state, saveBinding, saveDetails, loadStock };
}
async function open() { await fireEvent.click(screen.getByRole("button", { name: "configShopifyManageProduct" })); await screen.findByRole("dialog"); }
test("compact card defers stock reads until the manager is open", async () => {
  const h = scenario(true); renderWithApp(ShopifyLotIntegration, { props: h.props });
  expect(screen.queryByRole("textbox")).toBeNull(); expect(h.loadStock).not.toHaveBeenCalled();
  await open(); await waitFor(() => expect(h.loadStock).toHaveBeenCalledOnce());
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  h.state.listing = { ...listing, locationId: "gid://shopify/Location/5" };
  await waitFor(() => expect(h.loadStock).toHaveBeenCalledTimes(2));
});
test("link selection is a proposal until its own explicit save", async () => {
  const h = scenario(); renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyPickerOpen" }));
  await fireEvent.click(screen.getByRole("button", { name: /Store title.*Booster box/ })); expect(h.saveBinding).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmLink" }));
  await waitFor(() => expect(h.saveBinding).toHaveBeenCalledWith("link", { variantId: listing.variantId, locationId: location }));
});
test("dirty saved inventory fields keep draft creation visible and disabled", async () => {
  const h = scenario(); h.props.lot.draftName = "Unsaved inventory"; renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  expect(screen.getByRole("button", { name: "configShopifyCreateDraft" })).toBeDisabled();
  expect(screen.getByText("configShopifyDraftSaveFirst")).toBeTruthy();
});
test("details save independent title and price without closing inventory", async () => {
  const h = scenario(true); renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  await fireEvent.update(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" }), "Independent title");
  await fireEvent.update(screen.getByRole("textbox", { name: "shopifyDraftPriceLabel" }), "24.50");
  await fireEvent.click(screen.getByRole("button", { name: "configShopifySaveDetails" }));
  await waitFor(() => expect(h.saveDetails).toHaveBeenCalledWith({ title: "Independent title", price: "24.50" }));
  expect(h.props.lot.draftName).toBe("Inventory"); expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
test("remove and managed transfer each require their own confirmation view", async () => {
  const h = scenario(true); h.state.listing!.mode = "managed"; renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  expect(screen.queryByRole("button", { name: "configShopifySaveDetails" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyTransfer" })); expect(h.saveBinding).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmTransfer" }));
  await waitFor(() => expect(h.saveBinding).toHaveBeenCalledWith("transfer", { confirmTransfer: true }));
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRemoveLink" }));
  expect(screen.getByText("configShopifyRemoveHint")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmRemove" }));
  await waitFor(() => expect(h.saveBinding).toHaveBeenCalledWith("unlink", undefined));
});
test("dirty detail cancellation uses the same dialog and keeps edits when requested", async () => {
  const h = scenario(true); renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  await fireEvent.update(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" }), "Unsaved store title");
  await fireEvent.click(screen.getByRole("button", { name: "commonClose" }));
  expect(screen.getByText("configShopifyDiscardHint")).toBeTruthy(); expect(screen.getAllByRole("dialog")).toHaveLength(1);
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyKeepEditing" }));
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toHaveValue("Unsaved store title"); expect(h.saveDetails).not.toHaveBeenCalled();
});
test("opening and closing the manager preserves inventory drafts with one active dialog", async () => {
  const h = scenario();
  const Harness = defineComponent({ components: { ShopifyLotIntegration, AppDialogShell }, setup: () => ({ props: h.props, manager: ref(false), name: ref("Unsaved inventory") }), template: '<AppDialogShell :model-value="!manager" title="Inventory" eager><input v-model="name" aria-label="Inventory name" /><ShopifyLotIntegration v-bind="props" @manager-open="manager = $event" /></AppDialogShell>' });
  renderWithApp(Harness); await open();
  await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  await fireEvent.click(screen.getByRole("button", { name: "commonClose" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Inventory name" })).toHaveValue("Unsaved inventory"));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

test.each([375, 600, 1024])("manager uses the shared responsive shell and heading focus at %ipx", async width => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width }); window.dispatchEvent(new Event("resize"));
  try {
    const h = scenario(true); renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
    const dialog = screen.getByRole("dialog");
    if (width <= 600) expect(dialog).toHaveClass("v-dialog--fullscreen");
    else { expect(dialog).not.toHaveClass("v-dialog--fullscreen"); expect(dialog.querySelector(".app-dialog-overlay")).toHaveStyle({ maxWidth: "720px" }); }
    await waitFor(() => expect(dialog.querySelector(".shopify-manager__heading")).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).not.toHaveFocus();
    await fireEvent.click(screen.getByRole("button", { name: "commonClose" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "configShopifyManageProduct" })).toHaveFocus());
  } finally { Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 }); window.dispatchEvent(new Event("resize")); }
});

test.each(["member", "offline"])("%s can inspect the link but cannot submit Shopify changes", async mode => {
  const h = scenario(true); h.props.connection.canManage = mode !== "member"; h.props.connection.offline = mode === "offline";
  renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "configShopifyRemoveLink" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "configShopifySaveDetails" })).toBeDisabled();
  expect(h.saveBinding).not.toHaveBeenCalled(); expect(h.saveDetails).not.toHaveBeenCalled();
});

test("reopening an unresolved details edit locks the original draft and offers exact recovery", async () => {
  const h = scenario(true);
  h.state.pendingDetailsMutation = { lotId: 1, operationId: "same-attempt", expectedVersion: "v1", generation: 2, currency: "CAD", expected: { title: "Store title", price: "20.00" }, draft: { title: "Original attempted title", price: "25.00" } };
  h.state.detailsOutcome = { title: "confirmed", price: "unknown" };
  renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toHaveValue("Original attempted title");
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "configShopifyReplaceProduct" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRecoverOperation" }));
  await waitFor(() => expect(h.saveDetails).toHaveBeenCalledWith({ title: "Original attempted title", price: "25.00" }));
});

test("draft creation waits for its read refresh before mounting observed stock", async () => {
  const h = scenario();
  let finishCreate!: () => void, finishRefresh!: () => void;
  h.props.callbacks.loadPreview = async () => ({ title: "Draft", variantTitle: "Booster box", sku: "SKU", price: "20.00", currency: "CAD", quantity: 3, locations: [{ id: location, name: "Main" }], previewToken: "a".repeat(64) });
  h.props.callbacks.createDraft = vi.fn(async () => { h.state.listing = { ...listing }; await new Promise<void>(resolve => { finishCreate = resolve; }); });
  h.props.callbacks.refreshListing = vi.fn(() => new Promise<void>(resolve => { finishRefresh = resolve; }));
  renderWithApp(ShopifyLotIntegration, { props: h.props }); await open();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyCreateDraft" }));
  await screen.findByRole("textbox", { name: "shopifyDraftTitleLabel" });
  await fireEvent.click(screen.getByRole("button", { name: "shopifyDraftCreate" }));
  await waitFor(() => expect(h.props.callbacks.createDraft).toHaveBeenCalledOnce());
  expect(h.loadStock).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "commonClose" })).toBeDisabled();
  finishCreate(); await waitFor(() => expect(h.props.callbacks.refreshListing).toHaveBeenCalledOnce());
  expect(h.loadStock).not.toHaveBeenCalled(); finishRefresh();
  await waitFor(() => expect(h.loadStock).toHaveBeenCalledOnce());
  expect(screen.getByText("configShopifyDraftCreated")).toBeTruthy();
});
