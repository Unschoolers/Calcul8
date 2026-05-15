import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  getSaleDocumentMock,
  getWorkspaceMembershipMock,
  hasWorkspaceMembershipMock
} = vi.hoisted(() => ({
  getSaleDocumentMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../../lib/cosmos/salesRepository", () => ({
  getSaleDocument: getSaleDocumentMock,
  listSalesForLot: vi.fn()
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  getWorkspaceMembership: getWorkspaceMembershipMock,
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

import { buildWhatnotManualDuplicateCandidate } from "./duplicateDetection";
import {
    buildImportedSalePayload,
    buildMergedManualSalePayload
} from "./saleBuilders";
import { resolveWhatnotScope } from "./serviceCore";

function toExpectedLocalDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-1",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });
});

test("resolveWhatnotScope rejects stale workspace membership when the workspace is no longer active", async () => {
  hasWorkspaceMembershipMock.mockResolvedValue(false);
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-1",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });

  await assert.rejects(
    () => resolveWhatnotScope({} as never, "owner-1", "team-42", true),
    (error: { status?: number; message?: string }) =>
      error.status === 403 && error.message === "User is not a member of this workspace."
  );
});

test("buildWhatnotManualDuplicateCandidate finds a high-confidence buyer match", () => {
  const candidate = buildWhatnotManualDuplicateCandidate(
    {
      externalAccountId: "seller-1",
      buyerName: "Kaiju Buyer",
      quantity: 1,
      price: 14,
      date: "2026-03-02",
      orderPlacedAt: "2026-03-01T15:00:00.000Z",
      originalItemPrice: 14,
      title: "Kaiju #8",
      listingTitle: "Kaiju #8"
    },
    {
      id: "77",
      name: "Kaiju #8",
      lotType: "bulk",
      packsPerBox: 12
    },
    [{
      id: "sale:77:12",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "77",
      saleId: "12",
      sale: {
        id: 12,
        type: "pack",
        date: "2026-03-01",
        quantity: 1,
        packsCount: 1,
        price: 14,
        customer: "Kaiju Buyer",
        memo: "manual entry"
      },
      version: 1,
      updatedAt: "2026-03-02T00:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "m1",
      deletedAt: null
    }]
  );

  assert.equal(candidate?.saleId, "12");
  assert.equal(candidate?.confidence, "high");
  assert.match(candidate?.reasonSummary ?? "", /customer matches buyer name/i);
  assert.equal(candidate?.saleSummary.customer, "Kaiju Buyer");
});

test("buildWhatnotManualDuplicateCandidate rejects cross-seller mismatches", () => {
  const candidate = buildWhatnotManualDuplicateCandidate(
    {
      externalAccountId: "seller-2",
      buyerName: "Kaiju Buyer",
      quantity: 1,
      price: 14,
      date: "2026-03-02",
      orderPlacedAt: "2026-03-01T15:00:00.000Z",
      originalItemPrice: 14,
      title: "Kaiju #8",
      listingTitle: "Kaiju #8"
    },
    {
      id: "77",
      name: "Kaiju #8",
      lotType: "bulk",
      packsPerBox: 12
    },
    [{
      id: "sale:77:12",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "77",
      saleId: "12",
      sale: {
        id: 12,
        type: "pack",
        date: "2026-03-01",
        quantity: 1,
        packsCount: 1,
        price: 14,
        customer: "Kaiju Buyer",
        externalAccountId: "seller-1"
      },
      version: 1,
      updatedAt: "2026-03-02T00:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "m1",
      deletedAt: null
    }]
  );

  assert.equal(candidate, null);
});

test("buildWhatnotManualDuplicateCandidate matches against the local calendar day for UTC timestamps", () => {
  const orderPlacedAt = "2026-03-08T00:30:00.000Z";
  const localDate = toExpectedLocalDate(orderPlacedAt);

  const candidate = buildWhatnotManualDuplicateCandidate(
    {
      externalAccountId: "seller-1",
      buyerName: "Late Night Buyer",
      quantity: 1,
      price: 85,
      date: "2026-03-08",
      orderPlacedAt,
      originalItemPrice: 85,
      title: "Bleach Volume 2 box",
      listingTitle: "Bleach Volume 2 box"
    },
    {
      id: "77",
      name: "Bleach Volume 2",
      lotType: "bulk",
      packsPerBox: 12
    },
    [{
      id: "sale:77:12",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "77",
      saleId: "12",
      sale: {
        id: 12,
        type: "box",
        date: localDate,
        quantity: 1,
        packsCount: 12,
        price: 85,
        customer: "Late Night Buyer"
      },
      version: 1,
      updatedAt: "2026-03-08T03:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "m1",
      deletedAt: null
    }]
  );

  assert.equal(candidate?.saleId, "12");
});

test("buildImportedSalePayload stores buyer name as customer", () => {
  const payload = buildImportedSalePayload(
    {
      rowId: "row-1",
      externalSaleId: "sale-1",
      externalOrderId: "order-1",
      externalOrderItemId: "item-1",
      externalAccountId: "seller-1",
      title: "Kaiju #8",
      buyerName: "Buyer One",
      quantity: 2,
      price: 20,
      buyerShipping: 5,
      date: "2026-03-01",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp",
      action: "create",
      matchSource: "none",
      requiresManualReview: true
    },
    {
      rowId: "row-1",
      saleType: "pack"
    },
    {
      id: "77",
      name: "Kaiju #8",
      lotType: "bulk",
      packsPerBox: 12
    },
    13
  );

  assert.equal(payload.customer, "Buyer One");
  assert.equal(payload.price, 10);
  assert.equal(payload.quantity, 2);
});

test("buildMergedManualSalePayload overwrites core fields and preserves manual memo", async () => {
  getSaleDocumentMock.mockResolvedValue({
    id: "sale:77:12",
    docType: "sale",
    userId: "scope-1",
    scopeKey: "scope-1",
    lotId: "77",
    saleId: "12",
    sale: {
      id: 12,
      type: "pack",
      date: "2026-02-28",
      quantity: 1,
      packsCount: 1,
      price: 9,
      buyerShipping: 0,
      customer: "Old Customer",
      memo: "keep me"
    },
    version: 1,
    updatedAt: "2026-03-02T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "m1",
    deletedAt: null
  });

  const payload = await buildMergedManualSalePayload(
    {} as never,
    "scope-1",
    {
      rowId: "row-1",
      externalSaleId: "sale-1",
      externalOrderId: "order-1",
      externalOrderItemId: "item-1",
      externalAccountId: "seller-1",
      title: "Kaiju #8",
      buyerName: "Buyer One",
      quantity: 2,
      price: 20,
      buyerShipping: 5,
      date: "2026-03-01",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp",
      action: "create",
      matchSource: "none",
      requiresManualReview: true
    },
    {
      rowId: "row-1",
      saleType: "pack"
    },
    {
      id: "77",
      name: "Kaiju #8",
      lotType: "bulk",
      packsPerBox: 12
    },
    12
  );

  assert.equal(payload.date, "2026-03-01");
  assert.equal(payload.quantity, 2);
  assert.equal(payload.price, 10);
  assert.equal(payload.buyerShipping, 5);
  assert.equal(payload.customer, "Buyer One");
  assert.equal(payload.memo, "keep me");
});
