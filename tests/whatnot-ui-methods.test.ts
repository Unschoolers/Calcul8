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
  handleExpiredAuth: handleExpiredAuthMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/auth/index.ts", () => ({
  hasAuthSignal: hasAuthSignalMock
}));

import { uiWhatnotMethods } from "../src/app-core/methods/ui/whatnot/whatnot.ts";

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
  const pullCloudSync = vi.fn(async () => undefined);
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
    pullCloudSync: vi.fn(async () => undefined),
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
