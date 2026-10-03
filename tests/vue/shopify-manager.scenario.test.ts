import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import { nextTick, reactive } from "vue";
import ShopifyLotIntegration from "../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import type { ShopifyLotIntegrationProps } from "../../src/domain/shopify-lot-integration.ts";
import type { ShopifyManagerListing } from "../../shared/shopify-product-manager.ts";
import { renderWithApp } from "./render.ts";

const mainLocation = "gid://shopify/Location/4";
const overflowLocation = "gid://shopify/Location/5";
const currentListing = {
  mode: "linked" as const,
  shop: "store.myshopify.com",
  productId: "gid://shopify/Product/1",
  variantId: "gid://shopify/ProductVariant/2",
  inventoryItemId: "gid://shopify/InventoryItem/3",
  locationId: mainLocation,
  locationName: "Main warehouse",
  productTitle: "Tokyo Ghoul — Booster box",
  productStatus: "ACTIVE" as const,
  variantTitle: "Booster box",
  sku: "TG-BOX",
  price: "20.00",
  currency: "CAD",
  observedAt: "2026-10-03T10:00:00Z",
  availableLocations: [{ id: mainLocation, name: "Main warehouse" }, { id: overflowLocation, name: "Overflow storage" }]
};
const replacement = {
  productId: "gid://shopify/Product/10",
  variantId: "gid://shopify/ProductVariant/11",
  title: "Bleach Vol. 2",
  variantTitle: "Booster box",
  sku: "BLEACH-2",
  price: "24.50",
  inventoryItemId: "gid://shopify/InventoryItem/12",
  locations: [{ id: overflowLocation, name: "Overflow storage", available: 2 }]
};

function scenario(linked = true) {
  const state = reactive<ShopifyLotIntegrationProps["state"]>({
    listing: linked ? { ...currentListing } : null,
    listingStatus: "loaded",
    bindingVersion: "v1",
    generation: 2,
    error: null,
    errorOperation: null,
    recovery: "none",
    saving: false,
    search: {
      query: "box",
      results: [{ ...replacement }],
      loading: false,
      completed: true,
      hasMore: false,
      selectedVariantId: null,
      selectedLocationId: null
    }
  });
  const saveBinding = vi.fn<ShopifyLotIntegrationProps["callbacks"]["saveBinding"]>(async (action, selection) => {
    if (action === "unlink") state.listing = null;
    else if (action === "location" && state.listing) state.listing = { ...state.listing, locationId: selection?.locationId, locationName: "Overflow storage" };
    else if (action === "replace") state.listing = { ...currentListing, productId: replacement.productId, variantId: replacement.variantId, inventoryItemId: replacement.inventoryItemId, productTitle: replacement.title, locationId: selection?.locationId, locationName: "Overflow storage" };
    return { listing: state.listing as ShopifyManagerListing | null, bindingVersion: "v2", generation: 2 };
  });
  const saveDetails = vi.fn<ShopifyLotIntegrationProps["callbacks"]["saveDetails"]>(async () => ({
    listing: state.listing as ShopifyManagerListing | null,
    bindingVersion: "v2",
    generation: 2,
    outcome: { title: "confirmed", price: "confirmed" }
  }));
  const props: ShopifyLotIntegrationProps = {
    state,
    lot: { type: "bulk", saved: { name: "Inventory name", externalSku: "TG-BOX" }, draftName: "Inventory name", draftSku: "TG-BOX", boxesPurchased: 3, packsPerBox: 24, sales: [] },
    connection: { status: "connected", shop: currentListing.shop, offline: false, canManage: true },
    language: "en",
    t: key => key,
    callbacks: {
      loadPreview: vi.fn(async () => { throw new Error("unused"); }),
      createDraft: vi.fn(async () => {}),
      saveBinding,
      saveDetails,
      refreshListing: vi.fn(async () => {}),
      loadStock: vi.fn(async () => ({ shop: currentListing.shop!, variantId: currentListing.variantId, inventoryItemId: currentListing.inventoryItemId, locationId: currentListing.locationId, locationName: currentListing.locationName, available: 2, onHand: 3, committed: 1, observedAt: "2026-10-03T10:00:00.000Z" }))
    }
  };
  return { props, state, saveBinding, saveDetails };
}

async function openManager() {
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyManageProduct" }));
  await screen.findByRole("dialog");
}

test("binding overview shows the current product, observed status, price, and location", async () => {
  const h = scenario();
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();

  expect(screen.getByTestId("shopify-binding-details")).toHaveTextContent(currentListing.productTitle);
  expect(screen.getByTestId("shopify-product-status")).toHaveTextContent("configShopifyProductStatusActive");
  expect(screen.getByText("configShopifyBindingLocation").parentElement).toHaveTextContent("Main warehouse");
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toHaveValue(currentListing.productTitle);
  expect(screen.getByRole("textbox", { name: "shopifyDraftPriceLabel" })).toHaveValue(currentListing.price);
});

test("replace selection stays local until the user confirms the new binding", async () => {
  const h = scenario();
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();

  await fireEvent.click(screen.getByRole("button", { name: "configShopifyReplaceProduct" }));
  await fireEvent.click(screen.getByRole("button", { name: /Bleach Vol\. 2.*Booster box/ }));
  expect(h.saveBinding).not.toHaveBeenCalled();

  await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmReplace" }));
  await waitFor(() => expect(h.saveBinding).toHaveBeenCalledWith("replace", { variantId: replacement.variantId, locationId: overflowLocation }));
  expect(h.state.listing?.variantId).toBe(replacement.variantId);
});

test("location change saves only the new location for the existing variant", async () => {
  const h = scenario();
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyChangeLocation" }));

  const location = screen.getByRole("combobox", { name: "shopifyDraftLocationLabel" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: "Overflow storage" })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: "Overflow storage" }));
  await fireEvent.click(screen.getByRole("button", { name: "configShopifySaveLocation" }));

  await waitFor(() => expect(h.saveBinding).toHaveBeenCalledWith("location", { locationId: overflowLocation }));
  expect(h.state.listing?.variantId).toBe(currentListing.variantId);
  expect(h.state.listing?.locationId).toBe(overflowLocation);
});

test("removing a link requires confirmation and keeps the binding when canceled", async () => {
  const h = scenario();
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();

  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRemoveLink" }));
  expect(screen.getByText("configShopifyRemoveHint")).toBeTruthy();
  expect(h.saveBinding).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyBack" }));
  expect(h.state.listing?.variantId).toBe(currentListing.variantId);

  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRemoveLink" }));
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyConfirmRemove" }));
  await waitFor(() => expect(h.saveBinding).toHaveBeenCalledWith("unlink", undefined));
  expect(h.state.listing).toBeNull();
});

test("partial details recovery retries the exact saved title and price", async () => {
  const h = scenario();
  h.state.pendingDetailsMutation = {
    lotId: 41,
    operationId: "partial-details-attempt",
    expectedVersion: "v1",
    generation: 2,
    currency: "CAD",
    expected: { title: currentListing.productTitle, price: currentListing.price },
    draft: { title: "Custom Shopify title", price: "27.00" }
  };
  h.state.detailsOutcome = { title: "confirmed", price: "unknown" };
  h.saveDetails.mockImplementation(async () => ({
    listing: h.state.listing as ShopifyManagerListing | null,
    bindingVersion: "v2",
    generation: 2,
    outcome: { title: "confirmed", price: "unknown" }
  }));
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();

  expect(screen.getByText(/configShopifyOutcomeconfirmed.*configShopifyOutcomeunknown/)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toHaveValue("Custom Shopify title");
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRecoverOperation" }));

  await waitFor(() => expect(h.saveDetails).toHaveBeenCalledWith({ title: "Custom Shopify title", price: "27.00" }));
  expect(screen.getAllByRole("alert").find(element => element.textContent?.includes("configShopifyDetailsPartial"))).toBeTruthy();
  expect(screen.getByText(/configShopifyOutcomeconfirmed.*configShopifyOutcomeunknown/)).toBeTruthy();
});

test("selection cannot start a new binding while an earlier draft creation is unresolved", async () => {
  const h = scenario(false);
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyPickerOpen" }));
  await fireEvent.click(screen.getByRole("button", { name: /Bleach Vol\. 2.*Booster box/ }));
  h.state.pendingCreateMutation = {
    lotId: 41,
    operationId: "pending-create",
    expectedVersion: "v1",
    generation: 2,
    overrides: { title: "Original title", price: "24.50", locationId: overflowLocation },
    previewToken: "a".repeat(64)
  };

  const confirm = screen.getByRole("button", { name: "configShopifyConfirmLink" });
  await nextTick();
  await waitFor(() => expect(confirm).toBeDisabled());
  await fireEvent.click(confirm);
  expect(h.saveBinding).not.toHaveBeenCalled();
});

test("details cannot start a new write while a binding attempt is unresolved", async () => {
  const h = scenario();
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();
  await fireEvent.update(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" }), "A new title");
  h.state.pendingBindingMutation = {
    lotId: 41,
    mutationId: "pending-binding",
    expectedVersion: "v1",
    generation: 2,
    action: "location",
    locationId: overflowLocation
  };

  const save = screen.getByRole("button", { name: "configShopifySaveDetails" });
  await nextTick();
  await waitFor(() => expect(save).toBeDisabled());
  await fireEvent.click(save);
  expect(h.saveDetails).not.toHaveBeenCalled();
});

test("binding conflicts can refresh the listing without retrying the mutation", async () => {
  const h = scenario();
  h.state.pendingBindingMutation = {
    lotId: 41,
    mutationId: "conflicting-replacement",
    expectedVersion: "v1",
    generation: 2,
    action: "replace",
    variantId: replacement.variantId,
    locationId: overflowLocation
  };
  h.state.error = "configShopifyConflictError";
  h.state.errorOperation = "link";
  h.state.recovery = "refresh";
  h.props.callbacks.refreshListing = vi.fn(async () => {
    h.state.pendingBindingMutation = null;
    h.state.error = null;
    h.state.recovery = "none";
  });
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();

  const refresh = screen.getByRole("button", { name: "configShopifyRefreshListing" });
  expect(refresh).toBeEnabled();
  await fireEvent.click(refresh);

  await waitFor(() => expect(h.props.callbacks.refreshListing).toHaveBeenCalledOnce());
  expect(h.saveBinding).not.toHaveBeenCalled();
});

test("closing an ambiguous draft keeps its exact attempt for recovery later", async () => {
  const h = scenario(false);
  h.state.pendingCreateMutation = {
    lotId: 41,
    operationId: "ambiguous-create",
    expectedVersion: "v1",
    generation: 2,
    overrides: { title: "Original attempted title", price: "24.50", locationId: overflowLocation },
    previewToken: "b".repeat(64)
  };
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  await openManager();
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRecoverCreate" }));
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toHaveValue("Original attempted title");
  await fireEvent.click(screen.getByRole("button", { name: "commonClose" }));

  expect(screen.getByText("configShopifyRetainAttemptHint")).toBeTruthy();
  const closeWithAttemptRetained = screen.getAllByRole("button", { name: "commonClose" }).at(-1)!;
  await fireEvent.click(closeWithAttemptRetained);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(h.state.pendingCreateMutation?.overrides).toEqual({ title: "Original attempted title", price: "24.50", locationId: overflowLocation });
  expect(h.props.callbacks.createDraft).not.toHaveBeenCalled();
});

test("manager focuses its heading on entry and returns focus to its trigger on close", async () => {
  const h = scenario();
  renderWithApp(ShopifyLotIntegration, { props: h.props });
  const trigger = screen.getByRole("button", { name: "configShopifyManageProduct" });
  await fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(dialog.querySelector(".shopify-manager__heading")).toHaveFocus());

  await fireEvent.click(screen.getByRole("button", { name: "configShopifyRemoveLink" }));
  await waitFor(() => expect(dialog.querySelector(".shopify-manager__heading")).toHaveFocus());
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyBack" }));
  await waitFor(() => expect(dialog.querySelector(".shopify-manager__heading")).toHaveFocus());
  await fireEvent.click(screen.getByRole("button", { name: "commonClose" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
