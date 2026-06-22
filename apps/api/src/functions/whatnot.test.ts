import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
  createApiConfig,
  createHttpRequest,
  createInvocationContext
} from "../test-support/function-test-helpers";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  createWhatnotConnectUrlForActorMock,
  disconnectWhatnotForActorMock,
  discardWhatnotImportBatchForActorMock,
  getWhatnotReviewBatchForActorMock,
  getWhatnotStatusForActorMock,
  handleWhatnotOAuthCallbackMock,
  syncWhatnotOrdersForActorMock,
  createWhatnotImportBatchFromRowsForActorMock,
  confirmWhatnotImportBatchForActorMock,
  resolveUserIdMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  createWhatnotConnectUrlForActorMock: vi.fn(),
  disconnectWhatnotForActorMock: vi.fn(),
  discardWhatnotImportBatchForActorMock: vi.fn(),
  getWhatnotReviewBatchForActorMock: vi.fn(),
  getWhatnotStatusForActorMock: vi.fn(),
  handleWhatnotOAuthCallbackMock: vi.fn(),
  syncWhatnotOrdersForActorMock: vi.fn(),
  createWhatnotImportBatchFromRowsForActorMock: vi.fn(),
  confirmWhatnotImportBatchForActorMock: vi.fn(),
  resolveUserIdMock: vi.fn(async (request: { headers: { get(name: string): string | null } }) => {
    const authHeader = request.headers.get("authorization") || "";
    return authHeader.replace(/^Bearer\s+/i, "").trim() || "test-user";
  })
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../features/whatnot/services", () => ({
  createWhatnotConnectUrlForActor: createWhatnotConnectUrlForActorMock,
  disconnectWhatnotForActor: disconnectWhatnotForActorMock,
  discardWhatnotImportBatchForActor: discardWhatnotImportBatchForActorMock,
  getWhatnotReviewBatchForActor: getWhatnotReviewBatchForActorMock,
  getWhatnotStatusForActor: getWhatnotStatusForActorMock,
  handleWhatnotOAuthCallback: handleWhatnotOAuthCallbackMock,
  syncWhatnotOrdersForActor: syncWhatnotOrdersForActorMock,
  createWhatnotImportBatchFromRowsForActor: createWhatnotImportBatchFromRowsForActorMock,
  confirmWhatnotImportBatchForActor: confirmWhatnotImportBatchForActorMock
}));

vi.mock("../lib/auth", async () => {
  const { HttpError } = await import("../lib/auth/errors");
  return {
    HttpError,
    consumeAuthResponseHeaders: vi.fn(() => ({})),
    consumeAuthResponseCookies: vi.fn(() => []),
    resolveUserId: resolveUserIdMock
  };
});

import {
  whatnotConnectCallback,
  whatnotConnectStart,
  whatnotImport,
  whatnotReviewDiscard,
  whatnotReviewConfirm,
  whatnotReviewGet,
  whatnotStatus,
  whatnotSync
} from "./whatnot";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  getWhatnotStatusForActorMock.mockResolvedValue({
    configured: true,
    connected: true,
    displayName: "Seller",
    externalAccountId: "seller-1",
    scopes: ["read:orders"],
    lastSyncedAt: null,
    pendingReviewCount: 0,
    pendingBatchId: null
  });
  createWhatnotConnectUrlForActorMock.mockResolvedValue("https://whatnot.example/connect");
  handleWhatnotOAuthCallbackMock.mockResolvedValue({
    redirectUrl: "https://app.example/callback?whatnot=connected"
  });
  disconnectWhatnotForActorMock.mockResolvedValue(undefined);
  discardWhatnotImportBatchForActorMock.mockResolvedValue({
    discarded: true,
    batchId: "batch-review"
  });
  syncWhatnotOrdersForActorMock.mockResolvedValue({
    batchId: "batch-1",
    rows: [{ rowId: "r1" }]
  });
  createWhatnotImportBatchFromRowsForActorMock.mockResolvedValue({
    batchId: "batch-import",
    rows: [{ rowId: "r1" }]
  });
  getWhatnotReviewBatchForActorMock.mockResolvedValue({
    batchId: "batch-review",
    rows: [{ rowId: "r1" }]
  });
  confirmWhatnotImportBatchForActorMock.mockResolvedValue({
    importedCount: 1,
    updatedCount: 2,
    skippedCount: 3
  });
});

test("whatnotStatus reads workspaceId from query string and returns service payload", async () => {
  const response = await whatnotStatus(
    createHttpRequest({
      method: "GET",
      query: "workspaceId=team-42",
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(getWhatnotStatusForActorMock.mock.calls[0]?.[1], "user-a");
  assert.equal(getWhatnotStatusForActorMock.mock.calls[0]?.[2], "team-42");
  assert.equal((response.jsonBody as { connected: boolean }).connected, true);
});

test("whatnotConnectStart accepts workspaceId and appReturnUrl from body", async () => {
  const response = await whatnotConnectStart(
    createHttpRequest({
      method: "POST",
      body: {
        workspaceId: "team-42",
        appReturnUrl: "https://app.example/return"
      },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.deepEqual(createWhatnotConnectUrlForActorMock.mock.calls[0]?.slice(1), [
    "user-a",
    "team-42",
    "https://app.example/return"
  ]);
  assert.equal((response.jsonBody as { authorizeUrl: string }).authorizeUrl, "https://whatnot.example/connect");
});

test("whatnotConnectCallback redirects using callback result", async () => {
  const response = await whatnotConnectCallback(
    createHttpRequest({
      method: "GET",
      query: "code=abc&state=state-1",
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 302);
  assert.equal(handleWhatnotOAuthCallbackMock.mock.calls[0]?.[1]?.code, "abc");
  assert.equal(handleWhatnotOAuthCallbackMock.mock.calls[0]?.[1]?.state, "state-1");
  assert.equal((response.headers as { Location?: string }).Location, "https://app.example/callback?whatnot=connected");
});

test("whatnotSync returns batch summary for the actor and workspace", async () => {
  const response = await whatnotSync(
    createHttpRequest({
      method: "POST",
      body: { workspaceId: "team-42" },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(syncWhatnotOrdersForActorMock.mock.calls[0]?.[1], "user-a");
  assert.equal(syncWhatnotOrdersForActorMock.mock.calls[0]?.[2], "team-42");
  assert.equal((response.jsonBody as { batchId: string }).batchId, "batch-1");
  assert.equal((response.jsonBody as { pendingReviewCount: number }).pendingReviewCount, 1);
});

test("whatnotImport validates required rows and forwards normalized payload", async () => {
  const response = await whatnotImport(
    createHttpRequest({
      method: "POST",
      body: {
        workspaceId: "team-42",
        externalAccountId: "seller-1",
        rows: [{
          externalOrderId: "order-1",
          externalOrderItemId: "item-1",
          title: "My item",
          buyerName: "Jordan",
          listingTitle: "My listing",
          originalItemPrice: 19.5,
          orderPlacedAt: "2026-03-25T13:00:00.000Z",
          price: 19.5,
          date: "2026-03-25"
        }]
      },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  const importArgs = createWhatnotImportBatchFromRowsForActorMock.mock.calls[0]?.[2] as {
    workspaceId?: string;
    externalAccountId?: string;
    rows: Array<{
      externalOrderId: string;
      externalOrderItemId: string;
      title: string;
      price: number;
      date: string;
      buyerName?: string;
      listingTitle?: string;
      originalItemPrice?: number;
      orderPlacedAt?: string;
    }>;
  };
  assert.equal(importArgs.workspaceId, "team-42");
  assert.equal(importArgs.externalAccountId, "seller-1");
  assert.equal(importArgs.rows[0]?.externalOrderId, "order-1");
  assert.equal(importArgs.rows[0]?.buyerName, "Jordan");
  assert.equal(importArgs.rows[0]?.listingTitle, "My listing");
  assert.equal(importArgs.rows[0]?.originalItemPrice, 19.5);
  assert.equal(importArgs.rows[0]?.orderPlacedAt, "2026-03-25T13:00:00.000Z");
  assert.equal((response.jsonBody as { batchId: string }).batchId, "batch-import");
});

test("whatnotImport rejects empty rows payloads", async () => {
  const context = createInvocationContext();
  const response = await whatnotImport(
    createHttpRequest({
      method: "POST",
      body: {
        rows: []
      },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    context as never
  );

  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: string }).error, "Field 'rows' must contain at least one import row.");
  assert.equal(createWhatnotImportBatchFromRowsForActorMock.mock.calls.length, 0);
  assert.equal(context.error.mock.calls.length, 1);
});

test("whatnotReviewGet reads lookup params from query string", async () => {
  const response = await whatnotReviewGet(
    createHttpRequest({
      method: "GET",
      query: "workspaceId=team-42&batchId=batch-99",
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(getWhatnotReviewBatchForActorMock.mock.calls[0]?.[1], "user-a");
  assert.equal(getWhatnotReviewBatchForActorMock.mock.calls[0]?.[2], "team-42");
  assert.equal(getWhatnotReviewBatchForActorMock.mock.calls[0]?.[3], "batch-99");
});

test("whatnotReviewConfirm validates decisions and forwards parsed data", async () => {
  const response = await whatnotReviewConfirm(
    createHttpRequest({
      method: "POST",
      body: {
        batchId: "batch-1",
        workspaceId: "team-42",
        decisions: [
          {
            rowId: "row-1",
            lotId: 123,
            saleType: "pack",
            packsCount: 4,
            selectedImportAction: "update_existing",
            targetKind: "manual_candidate",
            targetSaleId: "sale-22"
          },
          {
            rowId: "row-3",
            lotId: 456,
            saleType: "box",
            selectedImportAction: "split_group"
          },
          {
            rowId: "row-2",
            skip: true
          }
        ]
      },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  const confirmArgs = confirmWhatnotImportBatchForActorMock.mock.calls[0]?.[2] as {
    batchId: string;
    workspaceId?: string;
    decisions: Array<{
      rowId: string;
      lotId?: string;
      saleType?: string;
      packsCount?: number;
      skip?: boolean;
      selectedImportAction?: string;
      targetKind?: string;
      targetSaleId?: string;
    }>;
  };
  assert.equal(confirmArgs.batchId, "batch-1");
  assert.equal(confirmArgs.workspaceId, "team-42");
  assert.deepEqual(confirmArgs.decisions, [
    {
      rowId: "row-1",
      lotId: "123",
      saleType: "pack",
      packsCount: 4,
      skip: false,
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "sale-22"
    },
    {
      rowId: "row-3",
      lotId: "456",
      saleType: "box",
      packsCount: undefined,
      skip: false,
      selectedImportAction: "split_group",
      targetKind: undefined,
      targetSaleId: undefined
    },
    {
      rowId: "row-2",
      lotId: undefined,
      saleType: undefined,
      packsCount: undefined,
      skip: true,
      selectedImportAction: undefined,
      targetKind: undefined,
      targetSaleId: undefined
    }
  ]);
  assert.equal((response.jsonBody as { ok: boolean }).ok, true);
});

test("whatnotReviewDiscard forwards batch lookup and returns discard result", async () => {
  const response = await whatnotReviewDiscard(
    createHttpRequest({
      method: "POST",
      body: {
        batchId: "batch-review",
        workspaceId: "team-42"
      },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.deepEqual(discardWhatnotImportBatchForActorMock.mock.calls[0]?.slice(1), [
    "user-a",
    {
      workspaceId: "team-42",
      batchId: "batch-review"
    }
  ]);
  assert.equal((response.jsonBody as { ok: boolean }).ok, true);
  assert.equal((response.jsonBody as { discarded: boolean }).discarded, true);
});

test("whatnotReviewConfirm rejects missing batchId", async () => {
  const response = await whatnotReviewConfirm(
    createHttpRequest({
      method: "POST",
      body: {
        decisions: []
      },
      headers: { authorization: "Bearer user-a" }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: string }).error, "Field 'batchId' is required.");
  assert.equal(confirmWhatnotImportBatchForActorMock.mock.calls.length, 0);
});
