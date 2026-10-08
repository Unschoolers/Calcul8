import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { configLotMethods } from "../src/app-core/methods/config-lots.ts";
import type { BindingResult, ProductDetailsResult } from "../shared/shopify-product-manager.ts";
import { makeLot } from "./helpers/fixtures.ts";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({
  fetchAuthenticatedApiResponse: apiCall,
  isApiRequestAborted: (error: unknown) => error instanceof DOMException && error.name === "AbortError"
}));

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    scopeKey: "user:1", shop: "store-a.myshopify.com", lotId: 41, mode: "linked", lifecycle: "active",
    productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2",
    inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4",
    lastQuantity: 8, updatedAt: "2026-10-03T00:00:00.000Z", version: "binding-v1",
    productTitle: "Current product", variantTitle: "Booster box", sku: "BOX-41", price: "12.00",
    currency: "USD", observedAt: "2026-10-03T00:00:00.000Z", productStatus: "ACTIVE" as const,
    ...overrides
  };
}

function context(overrides: Record<string, unknown> = {}) {
  const lot = makeLot({ id: 41, name: "Inventory title", lotType: "bulk", externalSku: "SKU-41" });
  return {
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 4,
    shopifyConnectionStatus: "connected", shopifyConnectionShop: "store-a.myshopify.com",
    currentLotId: lot.id, currentLotType: "bulk", lots: [lot], showRenameLotModal: true, shopifyEditManagerOpen: true,
    renameLotName: lot.name, renameLotExternalSku: lot.externalSku ?? "", renameLotWhatnotVertical: lot.whatnotVertical ?? null,
    renameLotShopifyEnabled: false, isOffline: false, isCurrentWorkspaceOwner: true, sellingCurrency: "USD",
    shopifyEditListing: null as ReturnType<typeof listing> | null, shopifyEditBindingVersion: null as string | null,
    shopifyEditGeneration: 3, shopifyEditOperationId: null as string | null,
    shopifyEditPendingDetailsMutation: null, shopifyEditPendingCreateMutation: null,
    shopifyEditDetailsOutcome: null, shopifyEditRequestRevision: 1,
    shopifyEditSessionAuthEpoch: 4, shopifyEditSessionScope: "{}", shopifyEditSessionLotId: lot.id,
    shopifyEditListingStatus: "loaded" as const, shopifyEditSaving: false, shopifyEditLoading: false,
    shopifyEditSearchQuery: "", shopifyEditSearchResults: [], shopifyEditSearchCursor: null,
    shopifyEditSearchHasMore: false, shopifyEditSearchCompleted: false,
    shopifyEditSelectedVariantId: null, shopifyEditSelectedLocationId: null,
    shopifyEditError: null as string | null, shopifyEditErrorOperation: null as string | null,
    shopifyEditRecovery: "none" as const, t: (key: string) => key,
    refreshShopifyBindings: vi.fn(async () => undefined), saveLotsToStorage: vi.fn(),
    notify: vi.fn(), pushCloudSync: vi.fn(async () => undefined),
    $nextTick: (callback: () => void) => callback(), initPortfolioChart: vi.fn(),
    ...overrides
  };
}

function callEditorMethod<T>(name: string, state: object, ...args: unknown[]): Promise<T> {
  const method = Reflect.get(configLotMethods, name);
  expect(typeof method, `${name} must be exposed by the lot method surface`).toBe("function");
  return (method as (this: object, ...values: unknown[]) => Promise<T>).apply(state, args);
}

beforeEach(() => apiCall.mockReset());
afterEach(() => vi.restoreAllMocks());

test("manager binding action uses the current version and refreshes scoped lot indicators after success", async () => {
  const state = context({ shopifyEditBindingVersion: null });
  const result: BindingResult = { listing: listing({ version: "binding-v2" }), bindingVersion: "binding-v2", shop: "store-a.myshopify.com", generation: 3 };
  apiCall.mockResolvedValue(response(result));

  await callEditorMethod("applyShopifyBinding", state, "link", {
    variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4"
  });

  expect(apiCall.mock.calls[0]?.[1]).toBe("/integrations/shopify/products/binding");
  const requestBody = JSON.parse(String(apiCall.mock.calls[0]?.[2]?.body));
  expect(requestBody).toMatchObject({
    lotId: 41, expectedVersion: null, generation: 3, action: "link",
    variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4"
  });
  expect(requestBody.mutationId).toEqual(expect.any(String));
  expect(state.shopifyEditListing?.productId).toBe("gid://shopify/Product/1");
  expect(state.shopifyEditBindingVersion).toBe("binding-v2");
  expect(state.refreshShopifyBindings).toHaveBeenCalledOnce();
});

test("draft preview rejects unsaved lot fields before contacting Shopify", async () => {
  const state = context({ renameLotName: "Unsaved inventory name" });

  await expect(callEditorMethod("loadShopifyDraftPreview", state)).rejects.toThrow("configShopifyDraftStalePreview");

  expect(apiCall).not.toHaveBeenCalled();
});

test("binding response from an older connection generation is rejected and keeps its retry identity", async () => {
  const state = context({ shopifyEditBindingVersion: "binding-v1" });
  apiCall.mockResolvedValue(response({
    listing: listing({ version: "binding-v2" }), bindingVersion: "binding-v2",
    shop: "store-a.myshopify.com", generation: 2
  }));

  await expect(callEditorMethod("applyShopifyBinding", state, "unlink")).rejects.toThrow("configShopifyErrorConnectionChanged");

  expect(state.shopifyEditPendingBindingMutation).toMatchObject({ generation: 3, action: "unlink" });
  expect(state.shopifyEditOperationId).toBe(state.shopifyEditPendingBindingMutation?.mutationId);
  expect(state.shopifyEditListing).toBeNull();
});

test("partial product detail retry repeats the original operation and exact payload until both fields are confirmed", async () => {
  const state = context({ shopifyEditListing: listing(), shopifyEditBindingVersion: "binding-v1" });
  const firstResult: ProductDetailsResult = {
    listing: listing({ productTitle: "New title", price: "12.00" }), bindingVersion: "binding-v2",
    shop: "store-a.myshopify.com", generation: 3, outcome: { title: "confirmed", price: "pending" }
  };
  const confirmedResult: ProductDetailsResult = {
    listing: listing({ productTitle: "New title", price: "15.00", version: "binding-v2" }), bindingVersion: "binding-v2",
    shop: "store-a.myshopify.com", generation: 3, outcome: { title: "confirmed", price: "confirmed" }
  };
  apiCall.mockResolvedValueOnce(response(firstResult)).mockResolvedValueOnce(response(confirmedResult));

  await callEditorMethod("saveShopifyProductDetails", state, { title: "New title", price: "15.00" });
  const originalRequest = JSON.parse(String(apiCall.mock.calls[0]?.[2]?.body));
  expect(state.shopifyEditPendingDetailsMutation).toMatchObject(originalRequest);
  expect(state.shopifyEditDetailsOutcome).toEqual({ title: "confirmed", price: "pending" });

  await callEditorMethod("saveShopifyProductDetails", state, { title: "Changed while recovering", price: "99.00" });
  const retryRequest = JSON.parse(String(apiCall.mock.calls[1]?.[2]?.body));
  expect(retryRequest).toEqual(originalRequest);
  expect(state.shopifyEditPendingDetailsMutation).toBeNull();
  expect(state.shopifyEditDetailsOutcome).toEqual({ title: "confirmed", price: "confirmed" });
  expect(state.refreshShopifyBindings).toHaveBeenCalledTimes(2);
});

test("a completed details request cannot clear a newer scope's pending edit after summary refresh", async () => {
  const state = context({ shopifyEditListing: listing(), shopifyEditBindingVersion: "binding-v1" });
  let finishOldSummary!: () => void;
  const oldSummary = new Promise<void>((resolve) => { finishOldSummary = resolve; });
  state.refreshShopifyBindings.mockReturnValueOnce(oldSummary).mockResolvedValueOnce(undefined);
  apiCall
    .mockResolvedValueOnce(response({
      listing: listing({ productTitle: "First scope title", price: "12.00", version: "binding-v2" }),
      bindingVersion: "binding-v2", shop: "store-a.myshopify.com", generation: 3,
      outcome: { title: "confirmed", price: "confirmed" }
    }))
    .mockResolvedValueOnce(response({
      listing: listing({ productTitle: "Second scope title", price: "12.00", version: "binding-v3" }),
      bindingVersion: "binding-v3", shop: "store-a.myshopify.com", generation: 3,
      outcome: { title: "confirmed", price: "pending" }
    }));

  const oldRequest = callEditorMethod("saveShopifyProductDetails", state, { title: "First scope title", price: "12.00" });
  await vi.waitFor(() => expect(state.refreshShopifyBindings).toHaveBeenCalledOnce());

  callEditorMethod("resetShopifyEditor", state);
  state.activeScopeType = "workspace";
  state.activeWorkspaceId = "workspace-2";
  state.shopifyEditSessionScope = JSON.stringify({ workspaceId: "workspace-2" });
  state.shopifyEditSessionAuthEpoch = state.googleAuthEpoch;
  state.shopifyEditSessionLotId = state.currentLotId;
  state.shopifyEditListing = listing({ productTitle: "Second scope title", version: "binding-v2" });
  state.shopifyEditBindingVersion = "binding-v2";
  state.shopifyEditGeneration = 3;
  state.shopifyEditListingStatus = "loaded";
  state.shopifyEditSaving = false;

  await callEditorMethod("saveShopifyProductDetails", state, { title: "Second scope title", price: "13.00" });
  const newerPending = state.shopifyEditPendingDetailsMutation;
  expect(newerPending).not.toBeNull();

  finishOldSummary();
  await oldRequest;

  expect(state.shopifyEditPendingDetailsMutation).toEqual(newerPending);
  expect(state.shopifyEditOperationId).toBe(newerPending?.operationId);
});

test("ambiguous draft create retry reuses its original operation, preview token, and final inputs", async () => {
  const state = context({ shopifyEditBindingVersion: "removed-v1", shopifyEditGeneration: 3 });
  const firstOverrides = { title: "Tokyo Booster", price: "22.50", locationId: "gid://shopify/Location/4" };
  const secondOverrides = { title: "Different draft", price: "80.00", locationId: "gid://shopify/Location/5" };
  const created: BindingResult = { listing: listing({ productTitle: firstOverrides.title }), bindingVersion: "binding-v2", shop: "store-a.myshopify.com", generation: 3 };
  apiCall.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(response(created));

  await expect(callEditorMethod("createShopifyDraft", state, firstOverrides, "a".repeat(64))).rejects.toThrow("lost response");
  const originalRequest = JSON.parse(String(apiCall.mock.calls[0]?.[2]?.body));
  expect(state.shopifyEditPendingCreateMutation).toMatchObject(originalRequest);

  await callEditorMethod("createShopifyDraft", state, secondOverrides, "b".repeat(64));
  const retryRequest = JSON.parse(String(apiCall.mock.calls[1]?.[2]?.body));
  expect(retryRequest).toEqual(originalRequest);
  expect(state.shopifyEditPendingCreateMutation).toBeNull();
  expect(state.shopifyEditListing?.productTitle).toBe(firstOverrides.title);
  expect(state.refreshShopifyBindings).toHaveBeenCalledOnce();
});

test("an older mutation cleanup cannot clear a newer pending editor action", async () => {
  const state = context();
  let finish!: (value: Response) => void;
  apiCall.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  const mutation = callEditorMethod("applyShopifyBinding", state, "unlink");
  state.shopifyEditRequestRevision += 1;
  state.shopifyEditOperationId = "newer-operation";
  state.shopifyEditSaving = true;
  finish(response({ listing: null, bindingVersion: "removed-v2", shop: "store-a.myshopify.com", generation: 3 }));
  await mutation;
  expect(state.shopifyEditSaving).toBe(true);
  expect(state.shopifyEditOperationId).toBe("newer-operation");
});

test("resetting Shopify editor state leaves unsaved inventory fields alone", async () => {
  const state = context({ renameLotName: "Unsaved name", renameLotExternalSku: "UNSAVED-SKU", renameLotWhatnotVertical: "sports" });
  const method = Reflect.get(configLotMethods, "resetShopifyEditor");
  expect(typeof method).toBe("function");
  await Promise.resolve((method as (this: object) => void).call(state));
  expect(state.renameLotName).toBe("Unsaved name");
  expect(state.renameLotExternalSku).toBe("UNSAVED-SKU");
  expect(state.renameLotWhatnotVertical).toBe("sports");
});

test("listing refresh restores a durable creation attempt with the original operation identity", async () => {
  const state = context({ shopifyEditListingStatus: "idle" });
  const mutation = { lotId: 41, operationId: "saved-create", expectedVersion: null, generation: 3,
    overrides: { title: "Custom booster", price: "19.00", locationId: "gid://shopify/Location/4" }, previewToken: "a".repeat(64) };
  apiCall.mockResolvedValue(response({ listing: null, bindingVersion: null, generation: 3, shop: "store-a.myshopify.com", pendingCreateMutation: mutation }));
  await callEditorMethod("refreshShopifyEditListing", state);
  expect(state.shopifyEditPendingCreateMutation).toEqual(mutation);
  expect(state.shopifyEditOperationId).toBe("saved-create");
});

test("listing refresh restores unresolved detail fields for exact retry after reload", async () => {
  const state = context({ shopifyEditListingStatus: "idle" });
  const pending = { lotId: 41, operationId: "saved-details", expectedVersion: "binding-v1", generation: 3, currency: "USD",
    expected: { title: "Current product", price: "12.00" }, draft: { title: "New title", price: "14.00" } };
  apiCall.mockResolvedValue(response({ listing: listing(), bindingVersion: "binding-v1", generation: 3, shop: "store-a.myshopify.com",
    pendingDetailsMutation: pending, detailsOutcome: { title: "confirmed", price: "unknown" } }));
  await callEditorMethod("refreshShopifyEditListing", state);
  expect(state.shopifyEditPendingDetailsMutation).toEqual(pending);
  expect(state.shopifyEditDetailsOutcome).toEqual({ title: "confirmed", price: "unknown" });
});
