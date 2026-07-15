import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../../test-support/function-test-helpers";

const {
  getWhatnotConnectionMock,
  getWhatnotImportBatchMock,
  claimPendingWhatnotImportBatchMock,
  initializeWhatnotConfirmationPlanMock,
  renewWhatnotImportConfirmationLeaseMock,
  checkpointWhatnotImportOperationMock,
  completeWhatnotImportBatchMock,
  markWhatnotImportBatchRecoverableMock,
  releaseClaimedWhatnotImportBatchMock,
  getWhatnotSaleImportMappingByExternalSaleKeyHashMock,
  getWhatnotTargetMappingByMatchKeyHashMock,
  listPendingWhatnotImportBatchesMock,
  createPendingWhatnotImportBatchMock,
  upsertWhatnotConnectionMock,
  upsertWhatnotImportBatchMock,
  upsertWhatnotSaleImportMappingMock,
  upsertWhatnotTargetMappingMock,
  getEffectiveSyncSnapshotMock,
  findSaleDocumentForWhatnotRecoveryMock,
  upsertSaleDocumentMock,
  listSalesForLotMock,
  getSaleDocumentMock
} = vi.hoisted(() => ({
  getWhatnotConnectionMock: vi.fn(),
  getWhatnotImportBatchMock: vi.fn(),
  claimPendingWhatnotImportBatchMock: vi.fn(),
  initializeWhatnotConfirmationPlanMock: vi.fn(),
  renewWhatnotImportConfirmationLeaseMock: vi.fn(),
  checkpointWhatnotImportOperationMock: vi.fn(),
  completeWhatnotImportBatchMock: vi.fn(),
  markWhatnotImportBatchRecoverableMock: vi.fn(),
  releaseClaimedWhatnotImportBatchMock: vi.fn(),
  getWhatnotSaleImportMappingByExternalSaleKeyHashMock: vi.fn(),
  getWhatnotTargetMappingByMatchKeyHashMock: vi.fn(),
  listPendingWhatnotImportBatchesMock: vi.fn(),
  createPendingWhatnotImportBatchMock: vi.fn(),
  upsertWhatnotConnectionMock: vi.fn(),
  upsertWhatnotImportBatchMock: vi.fn(),
  upsertWhatnotSaleImportMappingMock: vi.fn(),
  upsertWhatnotTargetMappingMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  findSaleDocumentForWhatnotRecoveryMock: vi.fn(),
  upsertSaleDocumentMock: vi.fn(),
  listSalesForLotMock: vi.fn(),
  getSaleDocumentMock: vi.fn()
}));

vi.mock("../../lib/cosmos/whatnotRepository", () => ({
  claimPendingWhatnotImportBatch: claimPendingWhatnotImportBatchMock,
  initializeWhatnotConfirmationPlan: initializeWhatnotConfirmationPlanMock,
  renewWhatnotImportConfirmationLease: renewWhatnotImportConfirmationLeaseMock,
  checkpointWhatnotImportOperation: checkpointWhatnotImportOperationMock,
  completeWhatnotImportBatch: completeWhatnotImportBatchMock,
  markWhatnotImportBatchRecoverable: markWhatnotImportBatchRecoverableMock,
  releaseClaimedWhatnotImportBatch: releaseClaimedWhatnotImportBatchMock,
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
  findSaleDocumentForWhatnotRecovery: findSaleDocumentForWhatnotRecoveryMock,
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
import { buildWhatnotConfirmationOperationKey } from "./confirmationRecovery";

beforeEach(() => {
  vi.resetAllMocks();
  getWhatnotConnectionMock.mockResolvedValue(null);
  getWhatnotImportBatchMock.mockResolvedValue(null);
  claimPendingWhatnotImportBatchMock.mockImplementation(async (...args: unknown[]) => {
    const batch = await getWhatnotImportBatchMock(...args);
    if (!batch) {
      return { status: "not_found", batch: null };
    }
    if (batch.status === "completed") {
      return { status: "already_completed", batch };
    }
    const recovery = args[4] as {
      fingerprint?: string;
      decisions?: unknown[];
      attemptId?: string;
      actorUserId?: string;
      leaseExpiresAt?: string;
    } | undefined;
    if (batch.confirmationFingerprint && recovery?.fingerprint && batch.confirmationFingerprint !== recovery.fingerprint) {
      return { status: "idempotency_mismatch", batch };
    }
    if (batch.status !== "pending_review" && batch.status !== "recoverable_error") {
      return { status: "not_claimable", batch };
    }
    return {
      status: "claimed",
      batch: {
        ...batch,
        status: "processing",
        confirmationFingerprint: batch.confirmationFingerprint ?? recovery?.fingerprint,
        confirmationDecisions: batch.confirmationDecisions ?? recovery?.decisions,
        confirmationAttempt: recovery ? {
          attemptId: recovery.attemptId,
          actorUserId: recovery.actorUserId,
          attemptNumber: (batch.confirmationAttempt?.attemptNumber ?? 0) + 1,
          claimedAt: args[3],
          leaseExpiresAt: recovery.leaseExpiresAt
        } : batch.confirmationAttempt
      }
    };
  });
  checkpointWhatnotImportOperationMock.mockImplementation(async (_config, input) => {
    const batch = await getWhatnotImportBatchMock();
    return {
      ...batch,
      status: "processing",
      confirmationAttempt: batch?.confirmationAttempt ?? { attemptId: input.attemptId },
      confirmationProgress: {
        ...(batch?.confirmationProgress ?? {}),
        [input.operationKey]: {
          outcome: input.outcome,
          saleId: input.saleId,
          lotId: input.lotId,
          completedAt: input.completedAt
        }
      }
    };
  });
  initializeWhatnotConfirmationPlanMock.mockImplementation(async (_config, input) => {
    const batch = await getWhatnotImportBatchMock();
    return {
      ...batch,
      status: "processing",
      confirmationAttempt: {
        ...(batch?.confirmationAttempt ?? {}),
        attemptId: input.attemptId,
        attemptNumber: (batch?.confirmationAttempt?.attemptNumber ?? 0) + 1
      },
      confirmationPlan: input.plan
    };
  });
  renewWhatnotImportConfirmationLeaseMock.mockImplementation(async (_config, input) => {
    const batch = await getWhatnotImportBatchMock();
    return {
      ...batch,
      status: "processing",
      confirmationAttempt: {
        ...(batch?.confirmationAttempt ?? {}),
        attemptId: input.attemptId,
        attemptNumber: (batch?.confirmationAttempt?.attemptNumber ?? 0) + 1,
        leaseExpiresAt: input.leaseExpiresAt
      }
    };
  });
  completeWhatnotImportBatchMock.mockImplementation(async (_config, batch, counts) => ({
    ...batch,
    ...counts,
    status: "completed",
    updatedAt: counts.completedAt
  }));
  releaseClaimedWhatnotImportBatchMock.mockResolvedValue(null);
  markWhatnotImportBatchRecoverableMock.mockResolvedValue(null);
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
  findSaleDocumentForWhatnotRecoveryMock.mockResolvedValue(null);
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

test("createWhatnotImportBatchFromRowsForActor suggests grouped manual sale when buyer date lot and total match despite title drift", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Nikke Box",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  listSalesForLotMock.mockResolvedValue([
    {
      id: "sale-doc-12",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "10",
      saleId: "12",
      sale: {
        date: "2026-05-08",
        price: 100,
        quantity: 3,
        packsCount: 36,
        type: "box",
        customer: "genbenji_tcg",
        memo: "3 Nikke boxes"
      },
      version: 1,
      updatedAt: "2026-05-08T18:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "sale:12"
    }
  ]);

  const batch = await createWhatnotImportBatchFromRowsForActor(createApiConfig(), "user-a", {
    externalAccountId: "seller-1",
    rows: [
      {
        externalOrderId: "order-1",
        externalOrderItemId: "item-1",
        title: "Nikke Box",
        listingTitle: "Nikke Box",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 100,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:16:16.000Z"
      },
      {
        externalOrderId: "order-2",
        externalOrderItemId: "item-2",
        title: "Nikke Box #2",
        listingTitle: "Nikke Box #2",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 100,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:37:13.000Z"
      },
      {
        externalOrderId: "order-3",
        externalOrderItemId: "item-3",
        title: "Nikke Box #3",
        listingTitle: "Nikke Box #3",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 100,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:56:28.000Z"
      }
    ]
  });

  assert.deepEqual(batch.rows.map((row) => row.targetSaleId), ["12", "12", "12"]);
  assert.deepEqual(batch.rows.map((row) => row.targetKind), ["manual_candidate", "manual_candidate", "manual_candidate"]);
  assert.match(batch.rows[0]?.manualDuplicateCandidate?.reasonSummary ?? "", /customer matches buyer name/);
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
  assert.deepEqual((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { externalTransactionRefs?: unknown }).externalTransactionRefs, [{
    provider: "whatnot",
    accountId: "seller-1",
    ledgerTransactionId: "order-1:item-1",
    orderId: "order-1",
    orderItemId: "item-1"
  }]);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls[0]?.[1]?.saleId, "7");
});

test("confirmWhatnotImportBatchForActor claims the batch before writing sales and completes the claimed batch", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-claim",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-claim",
      externalSaleId: "order-claim:item-claim",
      externalOrderId: "order-claim",
      externalOrderItemId: "item-claim",
      externalAccountId: "seller-1",
      title: "Lot A",
      quantity: 1,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-claim",
      action: "create",
      matchSource: "none",
      requiresManualReview: false
    }]
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-claim",
    decisions: [{
      rowId: "item-claim",
      lotId: "10",
      saleType: "pack"
    }]
  });

  assert.deepEqual(result, {
    importedCount: 1,
    updatedCount: 0,
    skippedCount: 0
  });
  assert.equal(claimPendingWhatnotImportBatchMock.mock.calls.length, 1);
  assert.equal(claimPendingWhatnotImportBatchMock.mock.invocationCallOrder[0] < upsertSaleDocumentMock.mock.invocationCallOrder[0], true);
  assert.equal(initializeWhatnotConfirmationPlanMock.mock.calls.length, 1);
  assert.equal(initializeWhatnotConfirmationPlanMock.mock.invocationCallOrder[0] < upsertSaleDocumentMock.mock.invocationCallOrder[0], true);
  assert.equal(initializeWhatnotConfirmationPlanMock.mock.calls[0]?.[1]?.plan?.[0]?.saleId, "1");
  assert.equal(completeWhatnotImportBatchMock.mock.calls.length, 1);
  assert.equal(completeWhatnotImportBatchMock.mock.invocationCallOrder[0] > upsertSaleDocumentMock.mock.invocationCallOrder[0], true);
  assert.equal(completeWhatnotImportBatchMock.mock.calls[0]?.[1]?.status, "processing");
  assert.deepEqual(
    Object.fromEntries(Object.entries(upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as Record<string, unknown>).filter(([key]) => key.startsWith("external"))),
    {
      externalProvider: "whatnot",
      externalAccountId: "seller-1",
      externalSaleId: "order-claim:item-claim",
      externalOrderId: "order-claim",
      externalOrderItemId: "item-claim",
      externalTransactionRefs: [{
        provider: "whatnot",
        accountId: "seller-1",
        ledgerTransactionId: "order-claim:item-claim",
        orderId: "order-claim",
        orderItemId: "item-claim"
      }]
    }
  );
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { memo?: string }).memo, "Lot A");
  assert.deepEqual(completeWhatnotImportBatchMock.mock.calls[0]?.[2], {
    importedCount: 1,
    updatedCount: 0,
    skippedCount: 0,
    completedAt: completeWhatnotImportBatchMock.mock.calls[0]?.[2]?.completedAt
  });
});

test("confirmWhatnotImportBatchForActor stops before sale writes when attempt ownership is lost", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-lost-lease",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-lost-lease",
      externalSaleId: "order-lost-lease:item-lost-lease",
      externalOrderId: "order-lost-lease",
      externalOrderItemId: "item-lost-lease",
      externalAccountId: "seller-1",
      title: "Lot A",
      quantity: 1,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-lost-lease",
      action: "create",
      matchSource: "none",
      requiresManualReview: false
    }]
  });
  renewWhatnotImportConfirmationLeaseMock.mockResolvedValueOnce(null);

  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-lost-lease",
      decisions: [{ rowId: "item-lost-lease", lotId: "10", saleType: "pack" }]
    }),
    (error: unknown) => (error as { code?: unknown }).code === "OPERATION_IN_PROGRESS"
  );

  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 0);
  assert.equal(checkpointWhatnotImportOperationMock.mock.calls.length, 0);
});

test("confirmWhatnotImportBatchForActor returns completed batch counts without duplicating work", async () => {
  claimPendingWhatnotImportBatchMock.mockResolvedValueOnce({
    status: "already_completed",
    batch: {
      batchId: "batch-done",
      status: "completed",
      origin: "csv_manual",
      externalAccountId: "seller-1",
      importedCount: 2,
      updatedCount: 1,
      skippedCount: 3,
      rows: []
    }
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-done",
    decisions: [{
      rowId: "item-1",
      lotId: "10",
      saleType: "pack"
    }]
  });

  assert.deepEqual(result, {
    importedCount: 2,
    updatedCount: 1,
    skippedCount: 3
  });
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 0);
  assert.equal(upsertWhatnotTargetMappingMock.mock.calls.length, 0);
  assert.equal(completeWhatnotImportBatchMock.mock.calls.length, 0);
});

test("confirmWhatnotImportBatchForActor releases a claimed batch when validation fails before writes", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-invalid",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-invalid",
      externalSaleId: "order-invalid:item-invalid",
      externalOrderId: "order-invalid",
      externalOrderItemId: "item-invalid",
      externalAccountId: "seller-1",
      title: "Lot A",
      quantity: 1,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-invalid",
      action: "create",
      matchSource: "none",
      requiresManualReview: false
    }]
  });

  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-invalid",
      decisions: [{
        rowId: "item-invalid",
        lotId: "99",
        saleType: "pack"
      }]
    }),
    (error: unknown) => {
      assert.equal((error as { status?: unknown }).status, 400);
      assert.match((error as Error).message, /Lot 99 was not found/);
      return true;
    }
  );

  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 0);
  assert.equal(releaseClaimedWhatnotImportBatchMock.mock.calls.length, 1);
  assert.equal(releaseClaimedWhatnotImportBatchMock.mock.calls[0]?.[1]?.status, "processing");
  assert.match(releaseClaimedWhatnotImportBatchMock.mock.calls[0]?.[3], /Lot 99 was not found/);
});

test("confirmWhatnotImportBatchForActor validates every row before writing the first sale", async () => {
  const baseRow = {
    externalAccountId: "seller-1",
    title: "Lot A",
    quantity: 1,
    price: 18,
    buyerShipping: 0,
    date: "2026-03-25",
    orderStatus: "COMPLETED",
    action: "create",
    matchSource: "none",
    requiresManualReview: false
  };
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-preflight",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [
      {
        ...baseRow,
        rowId: "item-valid",
        externalSaleId: "order-valid:item-valid",
        externalOrderId: "order-valid",
        externalOrderItemId: "item-valid",
        payloadFingerprint: "fp-valid"
      },
      {
        ...baseRow,
        rowId: "item-invalid",
        externalSaleId: "order-invalid:item-invalid",
        externalOrderId: "order-invalid",
        externalOrderItemId: "item-invalid",
        payloadFingerprint: "fp-invalid"
      }
    ]
  });

  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-preflight",
      decisions: [
        { rowId: "item-valid", lotId: "10", saleType: "pack" },
        { rowId: "item-invalid", lotId: "99", saleType: "pack" }
      ]
    }),
    /Lot 99 was not found/
  );

  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.equal(checkpointWhatnotImportOperationMock.mock.calls.length, 0);
  assert.equal(releaseClaimedWhatnotImportBatchMock.mock.calls.length, 1);
  assert.equal(markWhatnotImportBatchRecoverableMock.mock.calls.length, 0);
});

test("confirmWhatnotImportBatchForActor resumes after a sale write without rewriting the recovered sale", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    id: "batch-recovery-doc",
    batchId: "batch-recovery",
    scopeKey: "user-a",
    status: "recoverable_error",
    confirmationAttempt: {
      attemptId: "first-attempt",
      actorUserId: "user-a",
      attemptNumber: 1,
      claimedAt: "2026-03-25T17:00:00.000Z",
      leaseExpiresAt: "2026-03-25T17:05:00.000Z"
    },
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-recovery",
      externalSaleId: "order-recovery:item-recovery",
      externalOrderId: "order-recovery",
      externalOrderItemId: "item-recovery",
      externalAccountId: "seller-1",
      title: "Lot A",
      quantity: 1,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-recovery",
      action: "create",
      matchSource: "none",
      requiresManualReview: false
    }]
  });
  findSaleDocumentForWhatnotRecoveryMock.mockResolvedValue({
    id: "sale-recovered",
    docType: "sale",
    userId: "user-a",
    scopeKey: "user-a",
    lotId: "10",
    saleId: "7",
    sale: { type: "pack", memo: "Seller edited after the first attempt" },
    version: 3,
    updatedAt: "2026-03-25T18:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "whatnot:batch-recovery:item-recovery"
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-recovery",
    decisions: [{ rowId: "item-recovery", lotId: "10", saleType: "pack" }]
  });

  assert.deepEqual(result, { importedCount: 1, updatedCount: 0, skippedCount: 0 });
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls[0]?.[1]?.saleId, "7");
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls[0]?.[1]?.importBatchId, "batch-recovery");
  assert.equal(typeof upsertWhatnotSaleImportMappingMock.mock.calls[0]?.[1]?.importOperationKey, "string");
  assert.equal(checkpointWhatnotImportOperationMock.mock.calls.length, 1);
  assert.equal(completeWhatnotImportBatchMock.mock.calls.length, 1);
});

test("confirmWhatnotImportBatchForActor replays a planned manual update only while its base version is unchanged", async () => {
  const operationKey = buildWhatnotConfirmationOperationKey("batch-manual-recovery", ["item-manual-recovery"]);
  getWhatnotImportBatchMock.mockResolvedValue({
    id: "batch-manual-recovery-doc",
    batchId: "batch-manual-recovery",
    scopeKey: "user-a",
    status: "recoverable_error",
    confirmationAttempt: {
      attemptId: "first-attempt",
      actorUserId: "user-a",
      attemptNumber: 1,
      claimedAt: "2026-03-25T17:00:00.000Z",
      leaseExpiresAt: "2026-03-25T17:05:00.000Z"
    },
    confirmationPlan: [{
      operationKey,
      rowIds: ["item-manual-recovery"],
      mutationId: "whatnot_import:batch-manual-recovery:order-manual-recovery:item-manual-recovery",
      outcome: "updated",
      updateMode: "manual",
      lotId: "10",
      saleId: "9",
      targetSaleType: "box",
      expectedSaleVersion: 3,
      expectedSaleMutationId: "seller-base-mutation",
      saleWriteProven: false,
      externalSaleKeyHashes: [],
      rememberedMatchKeyHashes: []
    }],
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-manual-recovery",
      externalSaleId: "order-manual-recovery:item-manual-recovery",
      externalOrderId: "order-manual-recovery",
      externalOrderItemId: "item-manual-recovery",
      externalAccountId: "seller-1",
      title: "Lot A box",
      buyerName: "buyer",
      quantity: 1,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-manual-recovery",
      action: "update",
      targetKind: "manual_candidate",
      targetSaleId: "9",
      matchSource: "none",
      requiresManualReview: true
    }]
  });
  getSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-9",
    docType: "sale",
    userId: "user-a",
    scopeKey: "user-a",
    lotId: "10",
    saleId: "9",
    sale: { id: 9, type: "box", quantity: 1, price: 10, memo: "seller memo" },
    version: 3,
    mutationId: "seller-base-mutation"
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-manual-recovery",
    decisions: [{
      rowId: "item-manual-recovery",
      lotId: "10",
      saleType: "box",
      targetKind: "manual_candidate",
      targetSaleId: "9"
    }]
  });

  assert.deepEqual(result, { importedCount: 0, updatedCount: 1, skippedCount: 0 });
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 1);
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { memo?: string }).memo, "seller memo");

  upsertSaleDocumentMock.mockClear();
  getSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-9",
    docType: "sale",
    userId: "user-a",
    scopeKey: "user-a",
    lotId: "10",
    saleId: "9",
    sale: { id: 9, type: "box", quantity: 1, price: 10, memo: "new seller edit" },
    version: 4,
    mutationId: "seller-edit-after-plan"
  });
  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-manual-recovery",
      decisions: [{
        rowId: "item-manual-recovery",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "9"
      }]
    }),
    (error: unknown) => (error as { code?: unknown }).code === "RECOVERY_CONFLICT"
  );
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);

  const plannedBatch = await getWhatnotImportBatchMock();
  plannedBatch.confirmationPlan[0].saleWriteProven = true;
  plannedBatch.confirmationPlan[0].externalSaleKeyHashes = ["expected-whatnot-identity"];
  upsertWhatnotSaleImportMappingMock.mockClear();
  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-manual-recovery",
      decisions: [{
        rowId: "item-manual-recovery",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "9"
      }]
    }),
    (error: unknown) => (error as { code?: unknown }).code === "RECOVERY_CONFLICT"
  );
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 0);
});

test("confirmWhatnotImportBatchForActor marks the batch recoverable when a post-sale write fails", async () => {
  getWhatnotImportBatchMock.mockResolvedValue({
    id: "batch-failure-doc",
    batchId: "batch-failure",
    scopeKey: "user-a",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [{
      rowId: "item-failure",
      externalSaleId: "order-failure:item-failure",
      externalOrderId: "order-failure",
      externalOrderItemId: "item-failure",
      externalAccountId: "seller-1",
      title: "Lot A",
      quantity: 1,
      price: 18,
      buyerShipping: 0,
      date: "2026-03-25",
      orderStatus: "COMPLETED",
      payloadFingerprint: "fp-failure",
      action: "create",
      matchSource: "none",
      requiresManualReview: false
    }]
  });
  upsertWhatnotSaleImportMappingMock.mockRejectedValueOnce(new Error("mapping unavailable"));

  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-failure",
      decisions: [{ rowId: "item-failure", lotId: "10", saleType: "pack" }]
    }),
    (error: unknown) => {
      assert.equal((error as { status?: unknown }).status, 503);
      assert.equal((error as { code?: unknown }).code, "RECOVERY_CONFLICT");
      assert.match((error as Error).message, /partially saved/i);
      return true;
    }
  );

  assert.equal(upsertSaleDocumentMock.mock.calls.length, 1);
  assert.equal(releaseClaimedWhatnotImportBatchMock.mock.calls.length, 0);
  assert.equal(markWhatnotImportBatchRecoverableMock.mock.calls.length, 1);
  assert.equal(markWhatnotImportBatchRecoverableMock.mock.calls[0]?.[1]?.batchId, "batch-failure");
  assert.equal(markWhatnotImportBatchRecoverableMock.mock.calls[0]?.[1]?.failedPhase, "sale_mapping");
  assert.equal(typeof markWhatnotImportBatchRecoverableMock.mock.calls[0]?.[1]?.failedOperationKey, "string");
});

test("confirmWhatnotImportBatchForActor rejects changed decisions on retry before writing", async () => {
  claimPendingWhatnotImportBatchMock.mockResolvedValueOnce({
    status: "idempotency_mismatch",
    batch: { batchId: "batch-mismatch", status: "recoverable_error", rows: [] }
  });

  await assert.rejects(
    () => confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
      batchId: "batch-mismatch",
      decisions: [{ rowId: "item-1", lotId: "10", saleType: "pack" }]
    }),
    (error: unknown) => {
      assert.equal((error as { status?: unknown }).status, 409);
      assert.equal((error as { code?: unknown }).code, "IDEMPOTENCY_MISMATCH");
      assert.match((error as Error).message, /decisions changed/i);
      return true;
    }
  );

  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.equal(releaseClaimedWhatnotImportBatchMock.mock.calls.length, 0);
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
      type: "box",
      externalTransactionRefs: [{
        provider: "whatnot",
        accountId: "seller-1",
        ledgerTransactionId: "old-ledger",
        orderId: "old-order",
        orderItemId: "old-item"
      }]
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
    updatedCount: 1,
    skippedCount: 0
  });
  assert.equal(initializeWhatnotConfirmationPlanMock.mock.calls[0]?.[1]?.plan?.length, 1);
  assert.deepEqual(initializeWhatnotConfirmationPlanMock.mock.calls[0]?.[1]?.plan?.[0]?.rowIds, ["item-1", "item-2"]);
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 1);
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.saleId, "9");
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).quantity, 2);
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).price, 82);
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).customer, "cougarraph");
  assert.equal((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { quantity?: number; price?: number; customer?: string; memo?: string }).memo, "keep this memo");
  assert.deepEqual((upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as { externalTransactionRefs?: unknown }).externalTransactionRefs, [
    {
      provider: "whatnot",
      accountId: "seller-1",
      ledgerTransactionId: "old-ledger",
      orderId: "old-order",
      orderItemId: "old-item"
    },
    {
      provider: "whatnot",
      accountId: "seller-1",
      ledgerTransactionId: "order-1:item-1",
      orderId: "order-1",
      orderItemId: "item-1"
    },
    {
      provider: "whatnot",
      accountId: "seller-1",
      ledgerTransactionId: "order-2:item-2",
      orderId: "order-2",
      orderItemId: "item-2"
    }
  ]);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 2);
});

test("confirmWhatnotImportBatchForActor keeps loose grouped title-drift rows merged into one sale", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Nikke Box",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-title-drift",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [
      {
        rowId: "item-1",
        externalSaleId: "ledger-1",
        externalOrderId: "order-1",
        externalOrderItemId: "ledger-1",
        externalAccountId: "seller-1",
        title: "Nikke Box",
        listingTitle: "Nikke Box",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 104.66,
        buyerShipping: 0,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:16:16.000Z",
        orderStatus: "ORDER_EARNINGS",
        payloadFingerprint: "fp-1",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "12"
      },
      {
        rowId: "item-2",
        externalSaleId: "ledger-2",
        externalOrderId: "order-2",
        externalOrderItemId: "ledger-2",
        externalAccountId: "seller-1",
        title: "Nikke Box #2",
        listingTitle: "Nikke Box #2",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 105.86,
        buyerShipping: 0,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:37:13.000Z",
        orderStatus: "ORDER_EARNINGS",
        payloadFingerprint: "fp-2",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "12"
      },
      {
        rowId: "item-3",
        externalSaleId: "ledger-3",
        externalOrderId: "order-3",
        externalOrderItemId: "ledger-3",
        externalAccountId: "seller-1",
        title: "Nikke Box #3",
        listingTitle: "Nikke Box #3",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 106.45,
        buyerShipping: 0,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:56:28.000Z",
        orderStatus: "ORDER_EARNINGS",
        payloadFingerprint: "fp-3",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "12"
      }
    ]
  });
  getSaleDocumentMock.mockResolvedValue({
    id: "sale-doc-12",
    docType: "sale",
    userId: "scope-1",
    scopeKey: "scope-1",
    lotId: "10",
    saleId: "12",
    sale: {
      date: "2026-05-08",
      price: 105.6566666667,
      quantity: 3,
      packsCount: 36,
      buyerShipping: 0,
      customer: "genbenji_tcg",
      memo: "3 Nikke boxes",
      type: "box"
    },
    version: 1,
    updatedAt: "2026-05-08T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:12"
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-title-drift",
    decisions: [
      {
        rowId: "item-1",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "12"
      },
      {
        rowId: "item-2",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "12"
      },
      {
        rowId: "item-3",
        lotId: "10",
        saleType: "box",
        targetKind: "manual_candidate",
        targetSaleId: "12"
      }
    ]
  });

  assert.deepEqual(result, {
    importedCount: 0,
    updatedCount: 1,
    skippedCount: 0
  });
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 1);
  const sale = upsertSaleDocumentMock.mock.calls[0]?.[1]?.sale as {
    quantity?: number;
    price?: number;
    memo?: string;
    externalTransactionRefs?: unknown[];
  };
  assert.equal(sale.quantity, 3);
  assert.equal(sale.price, (104.66 + 105.86 + 106.45) / 3);
  assert.equal(sale.memo, "3 Nikke boxes");
  assert.deepEqual(sale.externalTransactionRefs, [
    {
      provider: "whatnot",
      accountId: "seller-1",
      ledgerTransactionId: "ledger-1",
      orderId: "order-1",
      orderItemId: "ledger-1"
    },
    {
      provider: "whatnot",
      accountId: "seller-1",
      ledgerTransactionId: "ledger-2",
      orderId: "order-2",
      orderItemId: "ledger-2"
    },
    {
      provider: "whatnot",
      accountId: "seller-1",
      ledgerTransactionId: "ledger-3",
      orderId: "order-3",
      orderItemId: "ledger-3"
    }
  ]);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 3);
});

test("confirmWhatnotImportBatchForActor splits grouped manual candidates into individual Whatnot sales", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{
      id: "10",
      name: "Nikke Box",
      lotType: "bulk",
      packsPerBox: 12
    }]
  });
  listSalesForLotMock.mockResolvedValue([
    {
      id: "sale-doc-12",
      docType: "sale",
      userId: "scope-1",
      scopeKey: "scope-1",
      lotId: "10",
      saleId: "12",
      sale: {
        date: "2026-05-08",
        price: 105.6566666667,
        quantity: 3,
        packsCount: 36,
        buyerShipping: 0,
        customer: "genbenji_tcg",
        memo: "3 Nikke boxes",
        type: "box"
      },
      version: 1,
      updatedAt: "2026-05-08T00:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "sale:12"
    }
  ]);
  getWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-split-title-drift",
    status: "pending_review",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    rows: [
      {
        rowId: "item-1",
        externalSaleId: "ledger-1",
        externalOrderId: "order-1",
        externalOrderItemId: "ledger-1",
        externalAccountId: "seller-1",
        title: "Nikke Box",
        listingTitle: "Nikke Box",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 104.66,
        buyerShipping: 0,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:16:16.000Z",
        orderStatus: "ORDER_EARNINGS",
        payloadFingerprint: "fp-1",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "12"
      },
      {
        rowId: "item-2",
        externalSaleId: "ledger-2",
        externalOrderId: "order-2",
        externalOrderItemId: "ledger-2",
        externalAccountId: "seller-1",
        title: "Nikke Box #2",
        listingTitle: "Nikke Box #2",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 105.86,
        buyerShipping: 0,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:37:13.000Z",
        orderStatus: "ORDER_EARNINGS",
        payloadFingerprint: "fp-2",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "12"
      },
      {
        rowId: "item-3",
        externalSaleId: "ledger-3",
        externalOrderId: "order-3",
        externalOrderItemId: "ledger-3",
        externalAccountId: "seller-1",
        title: "Nikke Box #3",
        listingTitle: "Nikke Box #3",
        buyerName: "genbenji_tcg",
        quantity: 1,
        price: 106.45,
        buyerShipping: 0,
        date: "2026-05-08",
        orderPlacedAt: "2026-05-08T20:56:28.000Z",
        orderStatus: "ORDER_EARNINGS",
        payloadFingerprint: "fp-3",
        action: "create",
        matchSource: "none",
        requiresManualReview: true,
        targetKind: "manual_candidate",
        targetSaleId: "12"
      }
    ]
  });

  const result = await confirmWhatnotImportBatchForActor(createApiConfig(), "user-a", {
    batchId: "batch-split-title-drift",
    decisions: [
      {
        rowId: "item-1",
        lotId: "10",
        saleType: "box",
        selectedImportAction: "split_group"
      },
      {
        rowId: "item-2",
        lotId: "10",
        saleType: "box",
        selectedImportAction: "split_group"
      },
      {
        rowId: "item-3",
        lotId: "10",
        saleType: "box",
        selectedImportAction: "split_group"
      }
    ]
  });

  assert.deepEqual(result, {
    importedCount: 3,
    updatedCount: 0,
    skippedCount: 0
  });
  assert.deepEqual(upsertSaleDocumentMock.mock.calls.map((call) => call[1].saleId), ["13", "14", "15"]);
  assert.deepEqual(upsertSaleDocumentMock.mock.calls.map((call) => ({
    saleId: call[1].saleId,
    sale: call[1].sale
  })), [
    {
      saleId: "13",
      sale: {
        id: 13,
        type: "box",
        quantity: 1,
        packsCount: 12,
        price: 104.66,
        priceIsTotal: undefined,
        buyerShipping: 0,
        date: "2026-05-08",
        customer: "genbenji_tcg",
        externalProvider: "whatnot",
        externalAccountId: "seller-1",
        externalSaleId: "ledger-1",
        externalOrderId: "order-1",
        externalOrderItemId: "ledger-1",
        memo: "Nikke Box",
        externalTransactionRefs: [{
          provider: "whatnot",
          accountId: "seller-1",
          ledgerTransactionId: "ledger-1",
          orderId: "order-1",
          orderItemId: "ledger-1"
        }]
      }
    },
    {
      saleId: "14",
      sale: {
        id: 14,
        type: "box",
        quantity: 1,
        packsCount: 12,
        price: 105.86,
        priceIsTotal: undefined,
        buyerShipping: 0,
        date: "2026-05-08",
        customer: "genbenji_tcg",
        externalProvider: "whatnot",
        externalAccountId: "seller-1",
        externalSaleId: "ledger-2",
        externalOrderId: "order-2",
        externalOrderItemId: "ledger-2",
        memo: "Nikke Box #2",
        externalTransactionRefs: [{
          provider: "whatnot",
          accountId: "seller-1",
          ledgerTransactionId: "ledger-2",
          orderId: "order-2",
          orderItemId: "ledger-2"
        }]
      }
    },
    {
      saleId: "15",
      sale: {
        id: 15,
        type: "box",
        quantity: 1,
        packsCount: 12,
        price: 106.45,
        priceIsTotal: undefined,
        buyerShipping: 0,
        date: "2026-05-08",
        customer: "genbenji_tcg",
        externalProvider: "whatnot",
        externalAccountId: "seller-1",
        externalSaleId: "ledger-3",
        externalOrderId: "order-3",
        externalOrderItemId: "ledger-3",
        memo: "Nikke Box #3",
        externalTransactionRefs: [{
          provider: "whatnot",
          accountId: "seller-1",
          ledgerTransactionId: "ledger-3",
          orderId: "order-3",
          orderItemId: "ledger-3"
        }]
      }
    }
  ]);
  assert.equal(getSaleDocumentMock.mock.calls.length, 3);
  assert.equal(upsertWhatnotSaleImportMappingMock.mock.calls.length, 3);
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
