import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { configLotMethods } from "../src/app-core/methods/config-lots.ts";
import { configLotEditMethods } from "../src/app-core/methods/config-lot-edit.ts";
import type { ShopifyDraftPreview } from "../src/domain/shopify-draft.ts";
import { ShopifyErrorCode, ShopifyUiError, shopifyUiErrorRecovery } from "../src/domain/shopify-ui-error.ts";
import frConfig from "../src/app-core/i18n/locales/fr/config.json";
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
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 4, shopifyConnectionStatus: "connected", shopifyConnectionShop: "store-a.myshopify.com",
    currentLotId: lot.id, currentLotType: "bulk", currentTab: "config", lots: [lot], showRenameLotModal: false,
    renameLotName: "", renameLotWhatnotVertical: lot.whatnotVertical ?? null, renameLotExternalSku: "", renameLotShopifyEnabled: false,
    shopifyEditListing: null, shopifyEditSearchQuery: "", shopifyEditSearchResults: [], shopifyEditSearchCursor: null,
    shopifyEditSearchHasMore: false, shopifyEditSearchCompleted: false, shopifyEditSelectedVariantId: null,
    shopifyEditSelectedLocationId: null, shopifyEditLoading: false, shopifyEditSaving: false, shopifyEditError: null, shopifyEditRecovery: "none" as const, shopifyEditErrorOperation: null,
    shopifyEditRequestRevision: 0, shopifyEditListingStatus: "idle" as const, shopifyEditSessionAuthEpoch: null,
    shopifyEditSessionScope: "", shopifyEditSessionLotId: null,
    externalSku: "OLD", shopifyEnabled: false, whatnotVertical: lot.whatnotVertical ?? null,
    isOffline: false, isGoogleSignedIn: false, hasProAccess: true, isCurrentWorkspaceOwner: true, t: (key: string) => key,
    notify: vi.fn(), saveLotsToStorage: vi.fn(), pushCloudSync: vi.fn(async () => undefined),
    $nextTick: (callback: () => void) => callback(), initPortfolioChart: vi.fn()
  };
  (ctx as typeof ctx & { refreshShopifyEditListing: () => Promise<void> }).refreshShopifyEditListing = () => configLotEditMethods.refreshShopifyEditListing.call(ctx as never);
  (ctx as typeof ctx & { searchShopifyEditProducts: (loadMore?: boolean) => Promise<void> }).searchShopifyEditProducts = (loadMore = false) => configLotEditMethods.searchShopifyEditProducts.call(ctx as never, loadMore);
  return { ctx, lot };
}
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => apiCall.mockReset());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("search explains when Shopify matches are excluded by inventory eligibility", async () => {
  const { ctx } = context();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null })
    : response({ variants: [], matchedVariantCount: 2, excludedVariantCount: 2, pageInfo: { hasNextPage: false, endCursor: null } }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.shopifyEditSearchQuery = "Kaiju";
  await configLotEditMethods.searchShopifyEditProducts.call(ctx as never);
  assert.equal(ctx.shopifyEditError, "configShopifyNoEligibleResults");
  assert.deepEqual(ctx.shopifyEditSearchResults, []);
});

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

test("cancel restoration survives the query debounce and keeps the selected link available to Save", async () => {
  vi.useFakeTimers();
  const { ctx } = context();
  const product = { productId: "p1", variantId: "v1", title: "Dragon Shield", variantTitle: "Display", sku: "SKU-1", price: "12.00", inventoryItemId: "i1", locations: [{ id: "l1", name: "Main", available: 2 }] };
  ctx.showRenameLotModal = true;
  ctx.shopifyEditSessionAuthEpoch = ctx.googleAuthEpoch;
  ctx.shopifyEditSessionScope = "{}";
  ctx.shopifyEditSessionLotId = ctx.currentLotId;
  ctx.shopifyEditListingStatus = "loaded";
  ctx.renameLotName = "Old title";
  ctx.renameLotExternalSku = "OLD";
  ctx.shopifyEditSearchQuery = "dragon";
  ctx.shopifyEditSearchResults = [product];
  ctx.shopifyEditSelectedVariantId = "v1";
  ctx.shopifyEditSelectedLocationId = "l1";
  apiCall.mockImplementation(async (_context: unknown, path: string) => path.endsWith("/link")
    ? response({ listing: { mode: "linked", productId: "p1", variantId: "v1", locationId: "l1" } })
    : response({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } }));

  configLotEditMethods.onShopifyEditQueryChange.call(ctx as never, "another query");
  assert.deepEqual(ctx.shopifyEditSearchResults, []);
  const restore = Reflect.get(configLotEditMethods, "restoreShopifyEditSelection") as (selection: unknown) => void;
  restore.call(ctx, { query: "dragon", variantId: "v1", locationId: "l1", product });
  await vi.advanceTimersByTimeAsync(301);

  assert.equal(ctx.shopifyEditSearchQuery, "dragon");
  assert.deepEqual(ctx.shopifyEditSearchResults, [product]);
  assert.equal(ctx.shopifyEditSelectedVariantId, "v1");
  assert.equal(ctx.shopifyEditSelectedLocationId, "l1");
  assert.equal(apiCall.mock.calls.some((call) => String(call[1]).endsWith("/products/search")), false);
  await configLotEditMethods.renameCurrentLot.call(ctx as never);
  const linkCall = apiCall.mock.calls.find((call) => String(call[1]).endsWith("/products/link"));
  assert.deepEqual(JSON.parse(String(linkCall?.[2]?.body)), { lotId: 41, variantId: "v1", locationId: "l1" });
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
  assert.equal(ctx.shopifyEditError, "configShopifyConflictError");
  assert.equal(ctx.shopifyEditErrorOperation, "link");
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

test("lot metadata can still be saved while Shopify is disconnected", async () => {
  const { ctx, lot } = context();
  ctx.shopifyConnectionStatus = "disconnected";
  configLotMethods.openRenameLotModal.call(ctx as never);
  ctx.renameLotName = "Renamed offline";
  await configLotMethods.renameCurrentLot.call(ctx as never);
  assert.equal(lot.name, "Renamed offline");
  assert.equal(ctx.showRenameLotModal, false);
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

test("typing a query debounces remote suggestions and does not search before two characters", async () => {
  vi.useFakeTimers();
  const { ctx } = context();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null })
    : response({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await vi.advanceTimersByTimeAsync(0);
  apiCall.mockClear();
  configLotEditMethods.onShopifyEditQueryChange.call(ctx as never, "a");
  await vi.advanceTimersByTimeAsync(400);
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/products/search")).length, 0);
  configLotEditMethods.onShopifyEditQueryChange.call(ctx as never, "ab");
  await vi.advanceTimersByTimeAsync(200);
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/products/search")).length, 0);
  await vi.advanceTimersByTimeAsync(150);
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/products/search")).length, 1);
  vi.useRealTimers();
});

test("changing query while a request is pending ignores stale suggestions and permits the newer search", async () => {
  vi.useFakeTimers();
  const { ctx } = context();
  const first = deferred<Response>();
  const calls: string[] = [];
  apiCall.mockImplementation((_context: unknown, path: string, init?: RequestInit) => {
    if (path.endsWith("/listing")) return response({ listing: null });
    calls.push(JSON.parse(String(init?.body)).query);
    return calls.length === 1 ? first.promise : response({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } });
  });
  configLotMethods.openRenameLotModal.call(ctx as never);
  await vi.advanceTimersByTimeAsync(0);
  configLotEditMethods.onShopifyEditQueryChange.call(ctx as never, "first");
  await vi.advanceTimersByTimeAsync(300);
  configLotEditMethods.onShopifyEditQueryChange.call(ctx as never, "second");
  await vi.advanceTimersByTimeAsync(300);
  first.resolve(response({ variants: [{ productId: "p", variantId: "stale", title: "Stale", variantTitle: "Default Title", sku: "S", price: "1", inventoryItemId: "i", locations: [] }], pageInfo: { hasNextPage: false, endCursor: null } }));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(ctx.shopifyEditSearchResults, []);
  vi.useRealTimers();
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

test("search results arriving after the connected Shopify shop changes are ignored", async () => {
  const { ctx } = context();
  const pendingSearch = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingSearch.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.shopifyEditSearchQuery = "product";
  const search = configLotEditMethods.searchShopifyEditProducts.call(ctx as never);
  ctx.shopifyConnectionShop = "other-store.myshopify.com";
  pendingSearch.resolve(response({ variants: [{ productId: "p", variantId: "stale", title: "Stale", variantTitle: "Default Title", sku: "S", price: "1.00", inventoryItemId: "i", locations: [] }], pageInfo: { hasNextPage: false, endCursor: null } }));
  await search;
  assert.deepEqual(ctx.shopifyEditSearchResults, []);
  assert.equal(ctx.shopifyEditLoading, false);
});

test("stale listing response unlocks a retry against the newly connected shop", async () => {
  const { ctx } = context();
  const staleListing = deferred<Response>();
  let listingCalls = 0;
  apiCall.mockImplementation((_context: unknown, path: string) => {
    if (!path.endsWith("/listing")) return response({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } });
    listingCalls += 1;
    return listingCalls === 1 ? staleListing.promise : response({ listing: null });
  });
  configLotMethods.openRenameLotModal.call(ctx as never);
  ctx.shopifyConnectionShop = "other-store.myshopify.com";
  staleListing.resolve(response({ listing: null }));
  await settle();
  assert.equal(ctx.shopifyEditListingStatus, "error");
  await configLotEditMethods.refreshShopifyEditListing.call(ctx as never);
  assert.equal(ctx.shopifyEditListingStatus, "loaded");
  assert.equal(listingCalls, 2);
});

test("stale link response clears saving without committing lot metadata", async () => {
  const { ctx, lot } = context();
  const staleLink = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : staleLink.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.renameLotName = "Must not commit";
  ctx.shopifyEditSearchResults = [{ productId: "p1", variantId: "v1", title: "Product", variantTitle: "Default Title", sku: "SKU", price: "2.00", inventoryItemId: "i1", locations: [{ id: "l1", name: "Main", available: 1 }] }];
  ctx.shopifyEditSelectedVariantId = "v1";
  ctx.shopifyEditSelectedLocationId = "l1";
  const save = configLotMethods.renameCurrentLot.call(ctx as never);
  ctx.shopifyConnectionShop = "other-store.myshopify.com";
  staleLink.resolve(response({ listing: { mode: "linked", productId: "p1", variantId: "v1", inventoryItemId: "i1", locationId: "l1" } }));
  await save;
  assert.equal(lot.name, "Old title");
  assert.equal(ctx.shopifyEditSaving, false);
  assert.equal(ctx.showRenameLotModal, true);
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

const draftPreview: ShopifyDraftPreview = {
  title: "Saved lot title", variantTitle: "Sealed box", sku: "SAVED-SKU", price: "34.50", currency: "CAD", quantity: 8,
  locations: [{ id: "gid://shopify/Location/123", name: "Main Warehouse" }], previewToken: "b".repeat(64)
};
const createdDraftListing = {
  mode: "linked" as const, shop: "store-a.myshopify.com", productId: "gid://shopify/Product/101",
  variantId: "gid://shopify/ProductVariant/102", inventoryItemId: "gid://shopify/InventoryItem/103",
  locationId: "gid://shopify/Location/123", productTitle: "Saved lot title", variantTitle: "Sealed box"
};

test("draft preview supersedes pending search but preserves the picker selection", async () => {
  const { ctx } = context();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : response({ preview: draftPreview }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  vi.useFakeTimers();
  configLotEditMethods.onShopifyEditQueryChange.call(ctx as never, "pending search");
  ctx.shopifyEditSelectedVariantId = "pending-variant";
  ctx.shopifyEditSelectedLocationId = "pending-location";
  ctx.shopifyEditLoading = true;
  const beforeRevision = ctx.shopifyEditRequestRevision;

  const result = await configLotEditMethods.loadShopifyDraftPreview.call(ctx as never);

  assert.equal(result.previewToken, "b".repeat(64));
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/products/create-preview")).length, 1);
  assert.deepEqual(JSON.parse(apiCall.mock.calls.find((call) => String(call[1]).endsWith("/products/create-preview"))![2].body), { lotId: 41 });
  assert.equal(ctx.shopifyEditRequestRevision, beforeRevision + 1);
  assert.equal(ctx.shopifyEditLoading, false);
  assert.equal(ctx.shopifyEditSelectedVariantId, "pending-variant");
  assert.equal(ctx.shopifyEditSelectedLocationId, "pending-location");
  assert.equal(vi.getTimerCount(), 0);
});

test("saved legacy lot name and SKU whitespace still permit an authoritative draft preview", async () => {
  const { ctx, lot } = context();
  lot.name = " Old title ";
  lot.externalSku = " OLD ";
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : response({ preview: draftPreview }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();

  const result = await configLotEditMethods.loadShopifyDraftPreview.call(ctx as never);
  assert.equal(result.previewToken, "b".repeat(64));
  await configLotMethods.renameCurrentLot.call(ctx as never);
  assert.equal(lot.name, "Old title");
  assert.equal(lot.externalSku, "OLD");
});

test("local draft ineligibility keeps its no-action guidance", async () => {
  const { ctx } = context();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing") ? response({ listing: null }) : response({ preview: draftPreview }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.isOffline = true;
  await assert.rejects(configLotEditMethods.loadShopifyDraftPreview.call(ctx as never), (error: unknown) => {
    assert.ok(error instanceof ShopifyUiError);
    assert.equal(error.code, null);
    assert.equal(error.messageKey, "configShopifyDraftNotAvailable");
    assert.equal(shopifyUiErrorRecovery(error), "none");
    return true;
  });
});

test("missing link location preserves picker guidance without retry recovery", async () => {
  const { ctx } = context();
  ctx.showRenameLotModal = true;
  ctx.shopifyEditSessionAuthEpoch = ctx.googleAuthEpoch;
  ctx.shopifyEditSessionScope = "{}";
  ctx.shopifyEditSessionLotId = ctx.currentLotId;
  ctx.renameLotName = "Old title";
  ctx.renameLotExternalSku = "OLD";
  ctx.renameLotShopifyEnabled = false;
  ctx.shopifyEditListingStatus = "loaded";
  ctx.shopifyEditSearchResults = [{ productId: "p1", variantId: "v1", title: "Product", variantTitle: "Default Title", sku: "SKU", price: "2.00", inventoryItemId: "i1", locations: [{ id: "l1", name: "Main", available: 1 }] }];
  ctx.shopifyEditSelectedVariantId = "v1";
  ctx.shopifyEditSelectedLocationId = null;
  await configLotMethods.renameCurrentLot.call(ctx as never);
  assert.equal(ctx.shopifyEditError, "configShopifyChooseLocation");
  assert.equal(ctx.shopifyEditRecovery, "none");
  assert.equal(ctx.shopifyEditErrorOperation, "link");
});

test("French API error is safe and recoverable, stale fields are typed, and retry clears recovery", async () => {
  const { ctx } = context();
  ctx.t = key => String((frConfig as Record<string, unknown>)[key] ?? key);
  apiCall.mockImplementation(async (_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null })
    : path.endsWith("/create-preview") ? response({ preview: draftPreview })
      : response({ code: ShopifyErrorCode.PRICE_REQUIRED, error: "provider token=secret" }, 400));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  await configLotEditMethods.loadShopifyDraftPreview.call(ctx as never);
  await assert.rejects(configLotEditMethods.createShopifyDraft.call(ctx as never, "gid://shopify/Location/7", "b".repeat(64)));
  assert.equal(ctx.shopifyEditError, "Ajoutez un prix de vente positif à ce lot.");
  assert.equal(ctx.shopifyEditRecovery, "none");
  assert.equal(ctx.shopifyEditErrorOperation, "create");
  assert.doesNotMatch(ctx.shopifyEditError, /secret|token=/);

  ctx.renameLotExternalSku = "unsaved";
  await assert.rejects(configLotEditMethods.loadShopifyDraftPreview.call(ctx as never), (error: unknown) => {
    assert.ok(error instanceof ShopifyUiError);
    assert.equal(shopifyUiErrorRecovery(error), "refresh");
    return true;
  });
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : response({ preview: draftPreview }));
  ctx.renameLotExternalSku = "OLD";
  ctx.shopifyEditError = "stale";
  ctx.shopifyEditRecovery = "retry";
  await configShopifyRetry(ctx);
  assert.equal(ctx.shopifyEditError, null);
  assert.equal(ctx.shopifyEditRecovery, "none");
});

async function configShopifyRetry(ctx: ReturnType<typeof context>["ctx"]): Promise<void> {
  await configLotEditMethods.loadShopifyDraftPreview.call(ctx as never);
}

test.each([
  ["scope", (ctx: ReturnType<typeof context>["ctx"]) => { ctx.activeScopeType = "workspace"; ctx.activeWorkspaceId = "workspace-2"; }],
  ["auth", (ctx: ReturnType<typeof context>["ctx"]) => { ctx.googleAuthEpoch += 1; }],
  ["lot", (ctx: ReturnType<typeof context>["ctx"]) => { ctx.currentLotId = 42; }]
] as const)("draft preview response after a %s change is rejected", async (_change, changeContext) => {
  const { ctx } = context();
  const pendingPreview = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingPreview.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();

  const loading = configLotEditMethods.loadShopifyDraftPreview.call(ctx as never);
  changeContext(ctx);
  pendingPreview.resolve(response({ preview: draftPreview }));
  await assert.rejects(loading, /configShopifyDraftStalePreview/);
});

test("cancel cannot close the lot editor while draft creation is pending", async () => {
  const { ctx } = context();
  const pendingCreate = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingCreate.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  const revision = ctx.shopifyEditRequestRevision;
  const create = configLotEditMethods.createShopifyDraft.call(ctx as never, draftPreview.locations[0]!.id, draftPreview.previewToken);

  configLotMethods.closeRenameLotModal.call(ctx as never);

  assert.equal(ctx.showRenameLotModal, true);
  assert.equal(ctx.shopifyEditSaving, true);
  assert.equal(ctx.shopifyEditRequestRevision, revision + 1);
  pendingCreate.resolve(response({ listing: createdDraftListing }));
  await create;
  assert.deepEqual(ctx.shopifyEditListing, createdDraftListing);
});

test("creating a draft links immediately, blocks duplicate creates, and leaves inventory history untouched", async () => {
  const { ctx, lot } = context();
  const pendingCreate = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingCreate.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  assert.equal(ctx.shopifyEditListingStatus, "loaded");
  assert.equal(ctx.shopifyEditSessionLotId, ctx.currentLotId);
  assert.equal(ctx.renameLotName, lot.name);
  assert.equal(ctx.renameLotExternalSku, lot.externalSku);
  assert.equal(ctx.currentLotType, "bulk");
  assert.equal(ctx.shopifyConnectionStatus, "connected");
  assert.equal(ctx.isOffline, false);
  assert.equal(ctx.shopifyEditSaving, false);
  assert.equal(ctx.activeScopeType, "personal");
  assert.equal(ctx.googleAuthEpoch, ctx.shopifyEditSessionAuthEpoch);
  assert.equal(ctx.shopifyEditSessionScope, "{}");
  const originalLot = { ...lot };
  const firstCreate = configLotEditMethods.createShopifyDraft.call(ctx as never, draftPreview.locations[0]!.id, draftPreview.previewToken);
  await configLotEditMethods.createShopifyDraft.call(ctx as never, draftPreview.locations[0]!.id, draftPreview.previewToken);
  assert.equal(apiCall.mock.calls.filter((call) => String(call[1]).endsWith("/products/create")).length, 1);
  assert.equal(ctx.shopifyEditSaving, true);
  assert.deepEqual(JSON.parse(apiCall.mock.calls.find((call) => String(call[1]).endsWith("/products/create"))![2].body), {
    lotId: 41, locationId: "gid://shopify/Location/123", previewToken: "b".repeat(64)
  });

  pendingCreate.resolve(response({ listing: createdDraftListing }));
  await firstCreate;
  assert.deepEqual(ctx.shopifyEditListing, createdDraftListing);
  assert.equal(ctx.shopifyEditSelectedVariantId, null);
  assert.equal(ctx.shopifyEditSelectedLocationId, null);
  assert.equal(ctx.shopifyEditSaving, false);
  assert.deepEqual(lot, originalLot);
  assert.equal(ctx.saveLotsToStorage.mock.calls.length, 0);
});

test("a draft response from another active store cannot replace the current listing", async () => {
  const { ctx } = context();
  const pendingCreate = deferred<Response>();
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : pendingCreate.promise);
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  const create = configLotEditMethods.createShopifyDraft.call(ctx as never, draftPreview.locations[0]!.id, draftPreview.previewToken);
  ctx.shopifyConnectionShop = "other-store.myshopify.com";
  pendingCreate.resolve(response({ listing: createdDraftListing }));
  await assert.rejects(create, /configShopifyDraftStalePreview/);
  assert.equal(ctx.shopifyEditListing, null);
  assert.equal(ctx.shopifyEditSaving, false);
  assert.equal(ctx.showRenameLotModal, true);
});

test("a malformed draft mapping cannot replace the existing listing or clear the pending link", async () => {
  const { ctx } = context();
  const malformed = { ...createdDraftListing, productId: "product-101", variantId: "variant-102", inventoryItemId: "item-103" };
  apiCall.mockImplementation((_context: unknown, path: string) => path.endsWith("/listing")
    ? response({ listing: null }) : response({ listing: malformed }));
  configLotMethods.openRenameLotModal.call(ctx as never);
  await settle();
  ctx.shopifyEditSelectedVariantId = "existing-selection";
  ctx.shopifyEditSelectedLocationId = "existing-location";
  ctx.shopifyEditSearchQuery = "keep this query";

  await assert.rejects(
    configLotEditMethods.createShopifyDraft.call(ctx as never, draftPreview.locations[0]!.id, draftPreview.previewToken),
    /configShopifyDraftInvalidResponse/
  );

  assert.equal(ctx.shopifyEditListing, null);
  assert.equal(ctx.shopifyEditSelectedVariantId, "existing-selection");
  assert.equal(ctx.shopifyEditSelectedLocationId, "existing-location");
  assert.equal(ctx.shopifyEditSearchQuery, "keep this query");
  assert.equal(ctx.shopifyEditSaving, false);
});
