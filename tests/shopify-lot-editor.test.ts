import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { configLotMethods } from "../src/app-core/methods/config-lots.ts";
import { configLotEditMethods } from "../src/app-core/methods/config-lot-edit.ts";
import { makeLot } from "./helpers/fixtures.ts";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse: apiCall }));

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function context() {
  const lot = makeLot({ id: 41, name: "Old title", lotType: "bulk", externalSku: "OLD", shopifyEnabled: false });
  const ctx = {
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 4, shopifyConnectionStatus: "connected",
    currentLotId: lot.id, currentLotType: "bulk", currentTab: "config", lots: [lot], showRenameLotModal: false,
    renameLotName: "", renameLotWhatnotVertical: lot.whatnotVertical ?? null, renameLotExternalSku: "", renameLotShopifyEnabled: false,
    shopifyEditListing: null, shopifyEditSearchQuery: "", shopifyEditSearchResults: [], shopifyEditSearchCursor: null,
    shopifyEditSearchHasMore: false, shopifyEditSearchCompleted: false, shopifyEditSelectedVariantId: null,
    shopifyEditSelectedLocationId: null, shopifyEditLoading: false, shopifyEditSaving: false, shopifyEditError: null,
    shopifyEditRequestRevision: 0, shopifyEditListingStatus: "idle" as const, shopifyEditSessionAuthEpoch: null,
    shopifyEditSessionScope: "", shopifyEditSessionLotId: null,
    externalSku: "OLD", shopifyEnabled: false, whatnotVertical: lot.whatnotVertical ?? null,
    isOffline: false, isGoogleSignedIn: false, hasProAccess: true, t: (key: string) => key,
    notify: vi.fn(), saveLotsToStorage: vi.fn(), pushCloudSync: vi.fn(async () => undefined),
    $nextTick: (callback: () => void) => callback(), initPortfolioChart: vi.fn()
  };
  (ctx as typeof ctx & { refreshShopifyEditListing: () => Promise<void> }).refreshShopifyEditListing = () => configLotEditMethods.refreshShopifyEditListing.call(ctx as never);
  return { ctx, lot };
}
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => apiCall.mockReset());
afterEach(() => vi.restoreAllMocks());

test("link is deferred until Save, then saves selected identity and lot metadata", async () => {
  const { ctx, lot } = context();
  apiCall.mockImplementation(async (_context: unknown, path: string) =>
    path.endsWith("/listing")
      ? response({ listing: null })
      : response({ listing: { mode: "linked", productId: "p1", variantId: "v1", inventoryItemId: "i1", locationId: "l1", productTitle: "Existing product" } }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  assert.equal(ctx.shopifyEditListingStatus, "loaded");
  ctx.renameLotName = "Updated title";
  ctx.renameLotExternalSku = "NEW";
  ctx.shopifyEditSearchResults = [{ productId: "p1", variantId: "v1", title: "Existing product", variantTitle: "Default Title", sku: "EXISTING", price: "12.00", inventoryItemId: "i1", locations: [{ id: "l1", name: "Main", available: 8 }] }];
  ctx.shopifyEditSelectedVariantId = "v1";
  ctx.shopifyEditSelectedLocationId = "l1";
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/link")).length, 0);
  await configLotMethods.renameCurrentLot.call(ctx as never);
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/link")).length, 1);
  assert.deepEqual(JSON.parse(apiCall.mock.calls.find((call) => String(call[1]).endsWith("/link"))[2].body), { lotId: 41, variantId: "v1", locationId: "l1" });
  assert.equal(lot.name, "Updated title");
  assert.equal(lot.externalSku, "NEW");
  assert.equal(ctx.externalSku, "NEW");
  assert.equal(ctx.showRenameLotModal, false);
});

test("link failure keeps lot metadata unchanged and leaves Edit Lot open", async () => {
  const { ctx, lot } = context();
  apiCall.mockImplementation(async (_context: unknown, path: string) =>
    path.endsWith("/listing") ? response({ listing: null }) : response({ error: "Variant already linked" }, 409));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.renameLotName = "Should not commit";
  ctx.renameLotExternalSku = "SHOULD-NOT-COMMIT";
  ctx.shopifyEditSearchResults = [{ productId: "p1", variantId: "v1", title: "Product", variantTitle: "Default Title", sku: "SKU", price: "2.00", inventoryItemId: "i1", locations: [{ id: "l1", name: "Main", available: 1 }] }];
  ctx.shopifyEditSelectedVariantId = "v1";
  ctx.shopifyEditSelectedLocationId = "l1";
  await configLotMethods.renameCurrentLot.call(ctx as never);
  assert.equal(lot.name, "Old title");
  assert.equal(lot.externalSku, "OLD");
  assert.equal(ctx.showRenameLotModal, true);
  assert.equal(ctx.shopifyEditError, "Variant already linked");
});

test("cancel discards SKU draft without calling the link endpoint", () => {
  const { ctx, lot } = context();
  ctx.shopifyConnectionStatus = "disconnected";
  configLotMethods.openRenameLotModal.call(ctx as never);
  ctx.renameLotExternalSku = "UNSAVED";
  configLotMethods.closeRenameLotModal.call(ctx as never);
  assert.equal(lot.externalSku, "OLD");
  assert.equal(apiCall.mock.calls.some((call) => String(call[1]).endsWith("/link")), false);
});

test("search is blocked while existing listing lookup is unresolved", async () => {
  const { ctx } = context();
  const pendingListing = deferred<Response>();
  apiCall.mockReturnValueOnce(pendingListing.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  ctx.shopifyEditSearchQuery = "product";
  await configLotMethods.searchShopifyEditProducts.call(ctx as never);
  assert.equal(apiCall.mock.calls.length, 1);
  assert.equal(ctx.shopifyEditListingStatus, "loading");
  pendingListing.resolve(response({ listing: null }));
  await settle();
  assert.equal(ctx.shopifyEditListingStatus, "loaded");
});

test("search results arriving after the query changes are ignored", async () => {
  const { ctx } = context();
  const pendingSearch = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingSearch.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.shopifyEditSearchQuery = "first";
  const search = configLotMethods.searchShopifyEditProducts.call(ctx as never);
  ctx.shopifyEditSearchQuery = "second";
  configLotMethods.onShopifyEditQueryChange.call(ctx as never, "second");
  pendingSearch.resolve(response({ variants: [{ productId: "p", variantId: "v", title: "Stale", variantTitle: "Default Title", sku: "S", price: "1.00", inventoryItemId: "i", locations: [] }], pageInfo: { hasNextPage: false, endCursor: null } }));
  await search;
  assert.deepEqual(ctx.shopifyEditSearchResults, []);
});

test("search results arriving after the scope changes are ignored", async () => {
  const { ctx } = context();
  const pendingSearch = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingSearch.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.shopifyEditSearchQuery = "product";
  const search = configLotMethods.searchShopifyEditProducts.call(ctx as never);
  ctx.activeScopeType = "workspace";
  ctx.activeWorkspaceId = "workspace-2";
  pendingSearch.resolve(response({ variants: [{ productId: "p", variantId: "v", title: "Stale", variantTitle: "Default Title", sku: "S", price: "1.00", inventoryItemId: "i", locations: [] }], pageInfo: { hasNextPage: false, endCursor: null } }));
  await search;
  assert.deepEqual(ctx.shopifyEditSearchResults, []);
});

test("duplicate Save does not send a second link request", async () => {
  const { ctx } = context();
  const pendingLink = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingLink.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.shopifyEditSearchResults = [{ productId: "p1", variantId: "v1", title: "Product", variantTitle: "Default Title", sku: "SKU", price: "2.00", inventoryItemId: "i1", locations: [{ id: "l1", name: "Main", available: 1 }] }];
  ctx.shopifyEditSelectedVariantId = "v1";
  ctx.shopifyEditSelectedLocationId = "l1";
  const firstSave = configLotMethods.renameCurrentLot.call(ctx as never);
  await settle();
  await configLotMethods.renameCurrentLot.call(ctx as never);
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/link")).length, 1);
  pendingLink.resolve(response({ listing: { mode: "linked", productId: "p1", variantId: "v1", inventoryItemId: "i1", locationId: "l1" } }));
  await firstSave;
});
