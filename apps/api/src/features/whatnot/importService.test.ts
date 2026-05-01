import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../../test-support/function-test-helpers";

const {
  getWhatnotConnectionMock,
  getWhatnotImportBatchMock,
  getWhatnotSaleImportMappingByExternalSaleKeyHashMock,
  getWhatnotTargetMappingByMatchKeyHashMock,
  listPendingWhatnotImportBatchesMock,
  createPendingWhatnotImportBatchMock,
  upsertWhatnotConnectionMock,
  upsertWhatnotImportBatchMock,
  upsertWhatnotSaleImportMappingMock,
  upsertWhatnotTargetMappingMock,
  getEffectiveSyncSnapshotMock,
  upsertSaleDocumentMock,
  listSalesForLotMock,
  getSaleDocumentMock
} = vi.hoisted(() => ({
  getWhatnotConnectionMock: vi.fn(),
  getWhatnotImportBatchMock: vi.fn(),
  getWhatnotSaleImportMappingByExternalSaleKeyHashMock: vi.fn(),
  getWhatnotTargetMappingByMatchKeyHashMock: vi.fn(),
  listPendingWhatnotImportBatchesMock: vi.fn(),
  createPendingWhatnotImportBatchMock: vi.fn(),
  upsertWhatnotConnectionMock: vi.fn(),
  upsertWhatnotImportBatchMock: vi.fn(),
  upsertWhatnotSaleImportMappingMock: vi.fn(),
  upsertWhatnotTargetMappingMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  upsertSaleDocumentMock: vi.fn(),
  listSalesForLotMock: vi.fn(),
  getSaleDocumentMock: vi.fn()
}));

vi.mock("../../lib/cosmos/whatnotRepository", () => ({
  createPendingWhatnotImportBatch: createPendingWhatnotImportBatchMock,
  getWhatnotConnection: getWhatnotConnectionMock,
  getWhatnotImportBatch: getWhatnotImportBatchMock,
  getWhatnotSaleImportMappingByExternalSaleKeyHash: getWhatnotSaleImportMappingByExternalSaleKeyHashMock,
  getWhatnotTargetMappingByMatchKeyHash: getWhatnotTargetMappingByMatchKeyHashMock,
  listPendingWhatnotImportBatches: listPendingWhatnotImportBatchesMock,
  upsertWhatnotConnection: upsertWhatnotConnectionMock,
  upsertWhatnotImportBatch: upsertWhatnotImportBatchMock,
  upsertWhatnotSaleImportMapping: upsertWhatnotSaleImportMappingMock,
  upsertWhatnotTargetMapping: upsertWhatnotTargetMappingMock
}));

vi.mock("../../lib/cosmos/salesRepository", () => ({
  upsertSaleDocument: upsertSaleDocumentMock,
  listSalesForLot: listSalesForLotMock,
  getSaleDocument: getSaleDocumentMock
}));

vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock
}));

import {
  confirmWhatnotImportBatchForActor,
  createWhatnotImportBatchFromRowsForActor,
  discardWhatnotImportBatchForActor
} from "./importService";

beforeEach(() => {
  vi.resetAllMocks();
  getWhatnotConnectionMock.mockResolvedValue(null);
  getWhatnotImportBatchMock.mockResolvedValue(null);
  getWhatnotSaleImportMappingByExternalSaleKeyHashMock.mockResolvedValue(null);
  getWhatnotTargetMappingByMatchKeyHashMock.mockResolvedValue(null);
  listPendingWhatnotImportBatchesMock.mockResolvedValue([]);
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Lot A",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  listSalesForLotMock.mockResolvedValue([]);
  createPendingWhatnotImportBatchMock.mockImplementation(async (_config, input) => ({
    id: "batch-1",
    ...input,
    batchId: "batch-1"
  }));
  upsertSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-1",
    saleId: "7",
    lotId: "10"
  });
  getSaleDocumentMock.mockResolvedValue(null);
});

test("createWhatnotImportBatchFromRowsForActor attaches a manual duplicate candidate", async () => {
  listSalesForLotMock.mockResolvedValue([
    {
      id: "sale-doc-1",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "10",
      saleId: "7",
      sale: {
        date: "2026-03-25",
        price: 18,
        quantity: 2,
        packsCount: 2,
        type: "pack",
        priceIsTotal: true,
        customer: "Jordan Lee",
        memo: "Jordan Lee"
      },
      version: 1,
      updatedAt: "2026-03-25T18:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "sale:1"
    }
  ]);

  const batch = await createWhatnotImportBatchFromRowsForActor(createApiConfig(), "user-a", {
    externalAccountId: "seller-1",
    rows: [{
      externalOrderId: "order-1",
      externalOrderItemId: "item-1",
      title: "Lot A",
      buyerName: "Jordan Lee",
      listingTitle: "Lot A",
      originalItemPrice: 9,
      quantity: 2,
      price: 18,
      date: "2026-03-25",
      orderPlacedAt: "2026-03-25T18:00:00.000Z"
    }]
  });

  assert.equal(batch.rows[0]?.targetKind, "manual_candidate");
  assert.equal(batch.rows[0]?.targetSaleId, "7");
  assert.equal(batch.rows[0]?.manualDuplicateCandidate?.saleId, "7");
  assert.equal(batch.rows[0]?.manualDuplicateCandidate?.confidence, "high");
});

test("createWhatnotImportBatchFromRowsForActor groups same customer and listing title rows against one manual sale", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Bleach vol2 box",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  listSalesForLotMock.mockResolvedValue([
    {
      id: "sale-doc-9",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "10",
      saleId: "9",
      sale: {
        date: "2026-02-22",
        price: 82,
        quantity: 2,
        packsCount: 24,
        type: "box",
        customer: "cougarraph",
        memo: "manual import"
      },
      version: 1,
      updatedAt: "2026-02-22T18:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "sale:9"
    }
  ]);

  const batch = await createWhatnotImportBatchFromRowsForActor(createApiConfig(), "user-a", {
    externalAccountId: "seller-1",
    rows: [
      {
        externalOrderId: "order-1",
        externalOrderItemId: "item-1",
        title: "Bleach vol2 box",
        listingTitle: "Bleach vol2 box",
        buyerName: "cougarraph",
        quantity: 1,
        price: 82,
        date: "2026-02-22",
        orderPlacedAt: "2026-02-22T17:47:05.000Z"
      },
      {
        externalOrderId: "order-2",
        externalOrderItemId: "item-2",
        title: "Bleach vol2 box",
        listingTitle: "Bleach vol2 box",
        buyerName: "cougarraph",
        quantity: 1,
        price: 82,
        date: "2026-02-22",
        orderPlacedAt: "2026-02-22T18:10:00.000Z"
      },
      {
        externalOrderId: "order-3",
        externalOrderItemId: "item-3",
        title: "Bleach RTYH",
        listingTitle: "Bleach RTYH",
        buyerName: "cougarraph",
        quantity: 1,
        price: 82,
        date: "2026-02-22",
        orderPlacedAt: "2026-02-22T18:12:00.000Z"
      }
    ]
  });

  assert.equal(batch.rows[0]?.targetKind, "manual_candidate");
  assert.equal(batch.rows[0]?.targetSaleId, "9");
  assert.equal(batch.rows[1]?.targetKind, "manual_candidate");
  assert.equal(batch.rows[1]?.targetSaleId, "9");
  assert.equal(batch.rows[2]?.targetKind, undefined);
  assert.equal(batch.rows[2]?.manualDuplicateCandidate, undefined);
});

test("confirmWhatnotImportBatchForActor updates a manual candidate sale and preserves memo", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-1",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-1",
      externalSaleId: "order-1:item-1",
      externalOrderId: "order-1",
      externalOrderItemId: "item-1",
      externalAccountId: "seller-1",
      title: "Lot A",
      buyerName: "Jordan Lee",
      quantity: 2,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-1",
      action: "create",
      matchSource: "none",
      requiresManualReview: true,
      targetKind: "manual_candidate",
      targetSaleId: "7",
      manualDuplicateCandidate: {
        saleId: "7",
        confidence: "high",
        reasonSummary: "Exact date, amount, and quantity match; customer matches buyer name",
        saleSummary: {
          date: "2026-03-25",
          price: 18,
          quantity: 2,
          packsCount: 2,
          customer: "Jordan Lee",
          memo: "Keep this memo"
        }
      }
    }]
  });

  getSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-1",
    docType: "sale",
    userId: "scope-1",
    scopeKey: "scope-1",
    lotId: "10",
    saleId: "7",
    sale: {
      date: "2026-03-01",
      price: 10,
      quantity: 1,
      packsCount: 1,
      buyerShipping: 0,
      customer: "Old Customer",
      memo: "Keep this memo",
      type: "pack"
    },
    version: 1,
    updatedAt: "2026-03-01T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:1"
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-1",
    decisions: [{
      rowId: "item-1",
      lotId: "10",
      targetKind: "manual_candidate",
      targetSaleId: "7"
    }]
  });

  assert.deepEqual(result, {
    importedCount: 0,
    updatedCount: 1,
    skippedCount: 0
  });
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.saleId, "7");
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { customer?: string; memo?: string }).customer, "Jordan Lee");
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { customer?: string; memo?: string }).memo, "Keep this memo");
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls[0]?.[1]?.saleId, "7");
});

test("confirmWhatnotImportBatchForActor preserves hard Whatnot mapping updates", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-2",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-2",
      externalSaleId: "order-2:item-2",
      externalOrderId: "order-2",
      externalOrderItemId: "item-2",
      externalAccountId: "seller-1",
      title: "Lot A",
      quantity: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-26",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-2",
      action: "update",
      matchSource: "remembered",
      requiresManualReview: false
    }]
  });
  getWhatnotSaleImportMappingByExternalSaleKeyHashMock.mockResolvedValue({
    id: "mapping-1",
    docType: "sale_import_mapping",
    userId: "scope-1",
    scopeKey: "scope-1",
    provider: "whatnot",
    externalAccountId: "seller-1",
    externalSaleId: "order-2:item-2",
    externalOrderId: "order-2",
    externalOrderItemId: "item-2",
    lotId: "10",
    saleId: "5",
    payloadFingerprint: "fp-old",
    updatedAt: "2026-03-25T18:00:00.000Z"
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-2",
    decisions: [{
      rowId: "item-2",
      lotId: "10",
      saleType: "pack"
    }]
  });

  assert.deepEqual(result, {
    importedCount: 0,
    updatedCount: 1,
    skippedCount: 0
  });
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.saleId, "5");
});

test("confirmWhatnotImportBatchForActor aggregates grouped manual candidate rows into one sale update", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Bleach vol2 box",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-3",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [
      {
        rowId: "item-1",
        externalSaleId: "order-1:item-1",
        externalOrderId: "order-1",
        externalOrderItemId: "item-1",
        externalAccountId: "seller-1",
        title: "Bleach vol2 box",
        listingTitle: "Bleach vol2 box",
        buyerName: "cougarraph",
        quantity: 1,
        price: 82,
        buyerShipping: 0,
        date: "2026-02-22",
        orderPlacedAt: "2026-02-22T17:47:05.000Z",
        orderStatus: "COMPLETED",
        payloadFingerprint: "fp-1",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "9"
      },
      {
        rowId: "item-2",
        externalSaleId: "order-2:item-2",
        externalOrderId: "order-2",
        externalOrderItemId: "item-2",
        externalAccountId: "seller-1",
        title: "Bleach vol2 box",
        listingTitle: "Bleach vol2 box",
        buyerName: "cougarraph",
        quantity: 1,
        price: 82,
        buyerShipping: 0,
        date: "2026-02-22",
        orderPlacedAt: "2026-02-22T18:10:00.000Z",
        orderStatus: "COMPLETED",
        payloadFingerprint: "fp-2",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "9"
      }
    ]
  });
  getSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-9",
    docType: "sale",
    userId: "scope-1",
    scopeKey: "scope-1",
    lotId: "10",
    saleId: "9",
    sale: {
      date: "2026-02-22",
      price: 80,
      quantity: 2,
      packsCount: 24,
      buyerShipping: 0,
      customer: "old customer",
      memo: "keep this memo",
      type: "box"
    },
    version: 1,
    updatedAt: "2026-02-22T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:9"
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-3",
    decisions: [
      {
        rowId: "item-1",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "9"
      },
      {
        rowId: "item-2",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "9"
      }
    ]
  });

  assert.deepEqual(result, {
    importedCount: 0,
    updatedCount: 2,
    skippedCount: 0
  });
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 1);
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.saleId, "9");
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).quantity, 2);
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).price, 82);
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).customer, "cougarraph");
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).memo, "keep this memo");
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 2);
});

test("confirmWhatnotImportBatchForActor grouped manual updates use the first non-empty buyer name", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Bleach vol2 box",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-4",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [
      {
        rowId: "item-1",
        externalSaleId: "order-1:item-1",
        externalOrderId: "order-1",
        externalOrderItemId: "item-1",
        externalAccountId: "seller-1",
        title: "Bleach vol2 box",
        listingTitle: "Bleach vol2 box",
        buyerName: "",
        quantity: 1,
        price: 85,
        buyerShipping: 0,
        date: "2026-03-08",
        orderPlacedAt: "2026-03-08T17:47:05.000Z",
        orderStatus: "COMPLETED",
        payloadFingerprint: "fp-1",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "9"
      },
      {
        rowId: "item-2",
        externalSaleId: "order-2:item-2",
        externalOrderId: "order-2",
        externalOrderItemId: "item-2",
        externalAccountId: "seller-1",
        title: "Bleach vol2 box",
        listingTitle: "Bleach vol2 box",
        buyerName: "Actual Buyer",
        quantity: 1,
        price: 85,
        buyerShipping: 0,
        date: "2026-03-08",
        orderPlacedAt: "2026-03-08T18:10:00.000Z",
        orderStatus: "COMPLETED",
        payloadFingerprint: "fp-2",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "9"
      }
    ]
  });
  getSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-9",
    docType: "sale",
    userId: "scope-1",
    scopeKey: "scope-1",
    lotId: "10",
    saleId: "9",
    sale: {
      date: "2026-03-08",
      price: 85,
      quantity: 2,
      packsCount: 24,
      buyerShipping: 0,
      customer: "",
      memo: "keep this memo",
      type: "box"
    },
    version: 1,
    updatedAt: "2026-03-08T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:9"
  });

  await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-4",
    decisions: [
      {
        rowId: "item-1",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "9"
      },
      {
        rowId: "item-2",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "9"
      }
    ]
  });

  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { customer?: string }).customer, "Actual Buyer");
});

test("discardWhatnotImportBatchForActor completes and clears a pending review batch", async () => {
  listPendingWhatnotImportBatchesMock.mockResolvedValue([{
    id: "doc-batch-1",
    docType: "whatnot_import_batch",
    userId: "user-a",
    scopeKey: "user-a",
    provider: "whatnot",
    batchId: "batch-1",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    startedByUserId: "user-a",
    status: "pending_review",
    startedAt: "2026-03-25T00:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-03-25T00:00:00.000Z",
    importWindowStartedAt: "2026-03-25T00:00:00.000Z",
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows: [{
      rowId: "row-1"
    }]
  }]);

  const result = await discardWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-1"
  });

  assert.equal(result.discarded, true);
  assert.equal(result.batchId, "batch-1");
  assert.equal(upsertWhatnotImportBatchMock.mock.calls.length, 1);
  assert.equal(upsertWhatnotImportBatchMock.mock.calls[0]?.[1]?.status, "completed");
  assert.deepEqual(upsertWhatnotImportBatchMock.mock.calls[0]?.[1]?.rows, []);
});
