import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchAuthenticatedApiResponseMock,
  handleExpiredAuthMock,
  resolveApiBaseUrlMock,
  hasAuthSignalMock
} = vi.hoisted(() => ({
  fetchAuthenticatedApiResponseMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn(),
  hasAuthSignalMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchAuthenticatedApiResponse: fetchAuthenticatedApiResponseMock,
  isApiRequestAborted: (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  handleExpiredAuth: handleExpiredAuthMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/auth/index.ts", () => ({
  hasAuthSignal: hasAuthSignalMock
}));

import { uiWhatnotMethods } from "../src/app-core/methods/ui/whatnot/whatnot.ts";
import { fetchWhatnotJson } from "../src/app-core/methods/ui/whatnot/whatnot-http.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMockStorage());
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.test"
    }
  });
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  hasAuthSignalMock.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Whatnot transport cancellation is handled without a user error notification", async () => {
  const app = {
    googleAuthEpoch: 0,
    hasProAccess: false,
    notify: vi.fn()
  };
  fetchAuthenticatedApiResponseMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

  const result = await fetchWhatnotJson(app as never, "/integrations/whatnot/status", { method: "GET" }, "Failed to load status.");

  assert.deepEqual(result, { ok: false, aborted: true });
  assert.equal(app.notify.mock.calls.length, 0);
});

test("Whatnot response body cancellation remains distinct from request failure", async () => {
  const app = { googleAuthEpoch: 0, hasProAccess: false, notify: vi.fn() };
  const response = new Response("{}");
  Object.defineProperty(response, "json", { value: async () => { throw new DOMException("Aborted", "AbortError"); } });
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(response);

  const result = await fetchWhatnotJson(app as never, "/integrations/whatnot/status", { method: "GET" }, "Failed to load status.");

  assert.deepEqual(result, { ok: false, aborted: true });
  assert.equal(app.notify.mock.calls.length, 0);
});

test("Whatnot cancellation preserves connection and sync statuses", async () => {
  const app = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: false,
    isCurrentWorkspaceOwner: true,
    notify: vi.fn(),
    whatnotConnectionStatus: "connected",
    whatnotConnectionSummary: { connected: true },
    whatnotSyncStatus: "success"
  };
  fetchAuthenticatedApiResponseMock.mockRejectedValue(new DOMException("Aborted", "AbortError"));

  await uiWhatnotMethods.refreshWhatnotStatus.call(app as never);
  assert.equal(app.whatnotConnectionStatus, "connected");
  assert.deepEqual(app.whatnotConnectionSummary, { connected: true });

  await uiWhatnotMethods.connectWhatnot.call(app as never);
  assert.equal(app.whatnotConnectionStatus, "connected");

  await uiWhatnotMethods.syncWhatnotSales.call(app as never);
  assert.equal(app.whatnotSyncStatus, "success");
  assert.equal(app.notify.mock.calls.length, 0);
});

test("prepareWhatnotCsvImport preserves the existing review batch when the API rejects the upload", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    error: "Whatnot CSV imports are limited to 250 rows."
  }), {
    status: 400,
    headers: { "Content-Type": "application/json" }
  }));
  const reviewRows = [{ rowId: "existing-row" }];
  const notify = vi.fn();
  const context = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: true,
    isCurrentWorkspaceOwner: true,
    notify,
    whatnotCsvRawInput: "new upload",
    whatnotCsvSellerAccountId: "seller-1",
    whatnotCsvHeaders: ["Order ID"],
    whatnotCsvRows: [{ externalOrderId: "new-order" }],
    whatnotCsvMapExternalSaleId: null,
    whatnotReviewBatchId: "existing-batch",
    whatnotReviewRows: reviewRows,
    whatnotConfirmationRetryPayload: "[]",
    showWhatnotCsvImportDialog: true,
    showWhatnotReviewDialog: true
  };

  const result = await uiWhatnotMethods.prepareWhatnotCsvImport.call(context as never, [{
    source: "csv",
    externalOrderId: "new-order",
    externalOrderItemId: "new-item",
    title: "Lot A",
    quantity: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-25"
  }]);

  assert.equal(result, false);
  assert.equal(context.whatnotReviewBatchId, "existing-batch");
  assert.equal(context.whatnotReviewRows, reviewRows);
  assert.equal(context.whatnotConfirmationRetryPayload, "[]");
  assert.equal(context.showWhatnotReviewDialog, true);
  assert.equal(context.whatnotCsvRawInput, "new upload");
  assert.equal(context.showWhatnotCsvImportDialog, true);
  assert.deepEqual(notify.mock.calls.at(-1), ["Whatnot CSV imports are limited to 250 rows.", "error"]);
});

test("confirmWhatnotImportBatch refreshes authoritative sales for affected lots after import", async () => {
  fetchAuthenticatedApiResponseMock
    .mockResolvedValueOnce(new Response(JSON.stringify({
      importedCount: 1,
      updatedCount: 0,
      skippedCount: 0
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      sales: [
        {
          id: 77,
          type: "box",
          quantity: 4,
          packsCount: 4,
          price: 85,
          buyerShipping: 0,
          customer: "cougarraph",
          date: "2026-03-08",
          version: 12
        }
      ]
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));

  const refreshWhatnotStatus = vi.fn(async () => undefined);
  const pullCloudSync = vi.fn(async () => ({ kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" }));
  const notify = vi.fn();

  const context = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: true,
    isCurrentWorkspaceOwner: true,
    notify,
    whatnotConnectionStatus: "connected",
    whatnotSyncStatus: "success",
    whatnotConnectionSummary: null,
    whatnotCsvRawInput: "",
    whatnotCsvSellerAccountId: "",
    whatnotCsvHeaders: [],
    whatnotCsvRows: [],
    whatnotCsvMapExternalSaleId: null,
    whatnotCsvMapOrderId: null,
    whatnotCsvMapOrderItemId: null,
    whatnotCsvMapSellerAccountId: null,
    whatnotCsvMapTitle: null,
    whatnotCsvMapListingTitle: null,
    whatnotCsvMapBuyerName: null,
    whatnotCsvMapOrderPlacedAt: null,
    whatnotCsvMapOriginalItemPrice: null,
    whatnotCsvMapSku: null,
    whatnotCsvMapProductCategory: null,
    whatnotCsvMapQuantity: null,
    whatnotCsvMapPrice: null,
    whatnotCsvMapBuyerShipping: null,
    whatnotCsvMapDate: null,
    whatnotCsvMapOrderStatus: null,
    whatnotReviewBatchId: "batch-1",
    whatnotReviewRows: [
      {
        rowId: "row-1",
        externalSaleId: "sale-1",
        externalOrderId: "order-1",
        externalOrderItemId: "item-1",
        externalAccountId: "seller-1",
        title: "Bleach Volume 2 box",
        listingTitle: "Bleach Volume 2 box",
        quantity: 4,
        price: 85,
        buyerShipping: 0,
        date: "2026-03-08",
        orderStatus: "ORDER_EARNINGS",
        action: "create",
        matchSource: "none",
        requiresManualReview: false,
        skipImport: false,
        selectedLotId: 7,
        selectedSaleType: "box",
        selectedPacksCount: 0,
        selectedImportAction: "create"
      }
    ],
    showWhatnotCsvImportDialog: false,
    showWhatnotReviewDialog: true,
    whatnotCallbackStatus: null,
    whatnotCallbackMessage: "",
    pullCloudSync,
    currentLotId: 7,
    sales: [
      {
        id: 77,
        type: "box",
        quantity: 4,
        packsCount: 4,
        price: 85,
        buyerShipping: 0,
        date: "2026-03-08",
        version: 1,
        customer: "cougarraph"
      }
    ],
    getSalesStorageKey: (lotId: number) => `sales:${lotId}`,
    refreshWhatnotStatus
  };

  await uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);

  assert.equal(refreshWhatnotStatus.mock.calls.length, 1);
  assert.equal(pullCloudSync.mock.calls.length, 1);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[1]?.[1], "/lots/7/sales");
  assert.equal(context.sales[0]?.version, 12);
  assert.equal(context.sales[0]?.customer, "cougarraph");
  assert.equal(localStorage.getItem("sales:7"), JSON.stringify(context.sales));
});

test("canceling a Whatnot batch for an awaiting lot sends no import request", async () => {
  let accept: (() => void) | undefined;
  let cancel: (() => void) | undefined;
  const context = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: true,
    isCurrentWorkspaceOwner: true,
    preferredLanguage: "en",
    notify: vi.fn(),
    askConfirmation: vi.fn((_payload, onAccept: () => void, onCancel?: () => void) => { accept = onAccept; cancel = onCancel; }),
    lots: [{ id: 7, expectedReceiptDate: "2026-11-12" }, { id: 8, expectedReceiptDate: "2026-12-01" }],
    whatnotReviewBatchId: "batch-preorder",
    whatnotReviewRows: [{
      rowId: "row-preorder",
      externalSaleId: "sale-preorder",
      externalOrderId: "order-preorder",
      externalOrderItemId: "item-preorder",
      title: "Awaiting box",
      quantity: 1,
      price: 25,
      buyerShipping: 0,
      date: "2026-03-08",
      action: "create",
      skipImport: false,
      selectedLotId: 7,
      selectedSaleType: "box",
      selectedPacksCount: 0,
      selectedImportAction: "create"
    }],
    whatnotConfirmationRetryPayload: null,
    isConfirmingWhatnotImport: false
  };

  const pending = uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  await Promise.resolve();
  assert.equal(context.askConfirmation.mock.calls.length, 1);
  const duplicate = uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  await Promise.resolve();
  assert.equal(context.askConfirmation.mock.calls.length, 1);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 0);
  cancel?.();
  await Promise.all([pending, duplicate]);

  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 0);
  assert.equal(context.isConfirmingWhatnotImport, false);
  assert.equal(context.lots[0]?.expectedReceiptDate, "2026-11-12");
  assert.equal(context.whatnotConfirmationRetryPayload, null);

  context.whatnotReviewRows[0]!.selectedLotId = 8;
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "RECOVERY_CONFLICT" }), {
    status: 503,
    headers: { "Content-Type": "application/json" }
  }));
  const editedAttempt = uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  await Promise.resolve();
  assert.equal(context.askConfirmation.mock.calls.length, 2);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 0);
  assert.equal(context.whatnotConfirmationRetryPayload, null);
  accept?.();
  await editedAttempt;
  const submitted = JSON.parse(String(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[2]?.body)) as {
    decisions?: Array<{ lotId?: number }>;
  };
  assert.equal(submitted.decisions?.[0]?.lotId, 8);
});

test.each(["en", "fr-CA"])("Whatnot preorder confirmation counts mapped non-skipped decisions in %s", async (language) => {
  const row = {
    rowId: "row-1", externalSaleId: "sale-1", externalOrderId: "order-1", externalOrderItemId: "item-1",
    title: "Box", quantity: 10, price: 25, buyerShipping: 0, date: "2026-03-08", action: "create",
    skipImport: false, selectedLotId: 7, selectedSaleType: "box", selectedPacksCount: 0, selectedImportAction: "create"
  };
  const context = {
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 0, hasProAccess: true,
    isCurrentWorkspaceOwner: true, preferredLanguage: language, notify: vi.fn(),
    askConfirmation: vi.fn((_payload, _accept, cancel) => cancel()),
    lots: [
      { id: 7, name: "Awaiting boxes", expectedReceiptDate: "2026-11-12" },
      { id: 8, name: "Skipped preorder", expectedReceiptDate: "2026-12-01" },
      { id: 9, name: "Received boxes" }
    ],
    whatnotReviewBatchId: "batch-count",
    whatnotReviewRows: [row, { ...row, rowId: "row-2" },
      { ...row, rowId: "skip-flag", selectedLotId: 8, skipImport: true },
      { ...row, rowId: "skip-action", selectedLotId: 8, selectedImportAction: "skip" },
      { ...row, rowId: "received", selectedLotId: 9 }],
    whatnotConfirmationRetryPayload: null, isConfirmingWhatnotImport: false
  };
  await uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  const text = context.askConfirmation.mock.calls[0]![0].text;
  assert.match(text, language === "en" ? /2 sales/ : /2 ventes/);
  assert.match(text, /Awaiting boxes/);
  assert.match(text, language === "en" ? /November 12, 2026/ : /12 novembre 2026/);
  assert.doesNotMatch(text, /Skipped preorder|Received boxes/);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 0);

  // A frozen retry describes its submitted decisions even if the visible review changed.
  Object.assign(context, { whatnotConfirmationRetryPayload: JSON.stringify([
    { rowId: "frozen", lotId: 7, skip: false, selectedImportAction: "create" },
    { rowId: "frozen-skip", lotId: 8, skip: true },
    { rowId: "frozen-skip-action", lotId: 8, selectedImportAction: "skip" },
    { rowId: "frozen-received", lotId: 9, skip: false }
  ]) });
  context.whatnotReviewRows = [{ ...row, selectedLotId: 8 }];
  await uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  const frozenText = context.askConfirmation.mock.calls[1]![0].text;
  assert.match(frozenText, language === "en" ? /1 sales/ : /1 ventes/);
  assert.match(frozenText, /Awaiting boxes/);
  assert.doesNotMatch(frozenText, /Skipped preorder|Received boxes/);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 0);
});

test("a frozen Whatnot retry reuses the accepted preorder confirmation", async () => {
  fetchAuthenticatedApiResponseMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: "RECOVERY_CONFLICT" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: "RECOVERY_CONFLICT" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    }));
  const context = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: true,
    isCurrentWorkspaceOwner: true,
    preferredLanguage: "en",
    notify: vi.fn(),
    askConfirmation: vi.fn((_payload, accept: () => void) => accept()),
    lots: [{ id: 7, expectedReceiptDate: "2026-11-12" }],
    whatnotReviewBatchId: "batch-preorder-retry",
    whatnotReviewRows: [{
      rowId: "row-preorder-retry",
      externalSaleId: "sale-preorder-retry",
      externalOrderId: "order-preorder-retry",
      externalOrderItemId: "item-preorder-retry",
      title: "Awaiting box",
      quantity: 1,
      price: 25,
      buyerShipping: 0,
      date: "2026-03-08",
      action: "create",
      skipImport: false,
      selectedLotId: 7,
      selectedSaleType: "box",
      selectedPacksCount: 0,
      selectedImportAction: "create"
    }],
    whatnotConfirmationRetryPayload: null,
    isConfirmingWhatnotImport: false
  };

  await uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  assert.equal(context.askConfirmation.mock.calls.length, 1);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 1);
  assert.match(String(context.whatnotConfirmationRetryPayload), /"rowId":"row-preorder-retry"/);

  await uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  assert.equal(context.askConfirmation.mock.calls.length, 1);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 2);
});

test("confirmWhatnotImportBatch guards duplicate requests and retains frozen decisions for recovery", async () => {
  let resolveRequest!: (response: Response) => void;
  fetchAuthenticatedApiResponseMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
    resolveRequest = resolve;
  }));
  const notify = vi.fn();
  const context = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: true,
    isCurrentWorkspaceOwner: true,
    preferredLanguage: "fr",
    notify,
    whatnotReviewBatchId: "batch-recovery",
    whatnotReviewRows: [{
      rowId: "row-1",
      externalSaleId: "sale-1",
      externalOrderId: "order-1",
      externalOrderItemId: "item-1",
      externalAccountId: "seller-1",
      title: "Boîte",
      quantity: 1,
      price: 25,
      buyerShipping: 0,
      date: "2026-03-08",
      orderStatus: "ORDER_EARNINGS",
      action: "create",
      matchSource: "none",
      requiresManualReview: false,
      skipImport: false,
      selectedLotId: 7,
      selectedSaleType: "box",
      selectedPacksCount: 0,
      selectedImportAction: "create"
    }],
    isConfirmingWhatnotImport: false,
    whatnotConfirmationRetryPayload: null,
    pullCloudSync: vi.fn(async () => ({ kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" })),
    refreshWhatnotStatus: vi.fn(),
    currentLotId: 7,
    sales: [],
    getSalesStorageKey: (lotId: number) => `sales:${lotId}`
  };

  const first = uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  const duplicate = uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 1);
  assert.equal(context.isConfirmingWhatnotImport, true);
  assert.match(String(context.whatnotConfirmationRetryPayload), /"rowId":"row-1"/);

  resolveRequest(new Response(JSON.stringify({ code: "RECOVERY_CONFLICT" }), {
    status: 503,
    headers: { "Content-Type": "application/json" }
  }));
  await Promise.all([first, duplicate]);

  assert.equal(context.isConfirmingWhatnotImport, false);
  assert.match(String(context.whatnotConfirmationRetryPayload), /"rowId":"row-1"/);
  assert.match(String(notify.mock.calls[0]?.[0]), /enregistrée partiellement/i);

  context.whatnotReviewRows[0]!.externalOrderId = "";
  context.whatnotReviewRows[0]!.selectedLotId = null as never;
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "RECOVERY_CONFLICT" }), {
    status: 503,
    headers: { "Content-Type": "application/json" }
  }));
  await uiWhatnotMethods.confirmWhatnotImportBatch.call(context as never);
  const retryBody = JSON.parse(String(fetchAuthenticatedApiResponseMock.mock.calls[1]?.[2]?.body)) as {
    decisions?: Array<{ lotId?: number }>;
  };
  assert.equal(retryBody.decisions?.[0]?.lotId, 7);
});

test("discardWhatnotReviewBatch clears the staged batch and refreshes Whatnot status", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    ok: true,
    discarded: true,
    batchId: "batch-1"
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const refreshWhatnotStatus = vi.fn(async () => undefined);
  const notify = vi.fn();
  const askConfirmation = vi.fn((_payload, onConfirm: () => void) => onConfirm());

  const context = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    askConfirmation,
    googleAuthEpoch: 0,
    hasProAccess: true,
    isCurrentWorkspaceOwner: true,
    notify,
    whatnotConnectionStatus: "connected",
    whatnotSyncStatus: "success",
    whatnotConnectionSummary: null,
    whatnotCsvRawInput: "",
    whatnotCsvSellerAccountId: "",
    whatnotCsvHeaders: [],
    whatnotCsvRows: [],
    whatnotCsvMapExternalSaleId: null,
    whatnotCsvMapOrderId: null,
    whatnotCsvMapOrderItemId: null,
    whatnotCsvMapSellerAccountId: null,
    whatnotCsvMapTitle: null,
    whatnotCsvMapListingTitle: null,
    whatnotCsvMapBuyerName: null,
    whatnotCsvMapOrderPlacedAt: null,
    whatnotCsvMapOriginalItemPrice: null,
    whatnotCsvMapSku: null,
    whatnotCsvMapProductCategory: null,
    whatnotCsvMapQuantity: null,
    whatnotCsvMapPrice: null,
    whatnotCsvMapBuyerShipping: null,
    whatnotCsvMapDate: null,
    whatnotCsvMapOrderStatus: null,
    whatnotReviewBatchId: "batch-1",
    whatnotReviewRows: [{ rowId: "row-1" }],
    showWhatnotCsvImportDialog: false,
    showWhatnotReviewDialog: true,
    whatnotCallbackStatus: null,
    whatnotCallbackMessage: "",
    pullCloudSync: vi.fn(async () => ({ kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" })),
    currentLotId: 0,
    sales: [],
    getSalesStorageKey: (lotId: number) => `sales:${lotId}`,
    refreshWhatnotStatus
  };

  uiWhatnotMethods.discardWhatnotReviewBatch.call(context as never);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(askConfirmation.mock.calls.length, 1);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[1], "/integrations/whatnot/review/discard");
  assert.equal(context.whatnotReviewBatchId, null);
  assert.deepEqual(context.whatnotReviewRows, []);
  assert.equal(context.showWhatnotReviewDialog, false);
  assert.equal(refreshWhatnotStatus.mock.calls.length, 1);
  assert.deepEqual(notify.mock.calls.at(-1), ["Whatnot review batch discarded.", "info"]);
});
