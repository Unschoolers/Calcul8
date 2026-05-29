import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  ApiConfig,
  WhatnotConnectionDocument,
  WhatnotImportBatchDocument,
  WhatnotOAuthStateDocument,
  WhatnotSaleImportMappingDocument,
  WhatnotTargetMappingDocument
} from "../../types";

const { randomUUIDMock } = vi.hoisted(() => ({
  randomUUIDMock: vi.fn(() => "batch-uuid-1")
}));

vi.mock("node:crypto", () => ({
  randomUUID: randomUUIDMock
}));

const {
  getContainersMock,
  isConflictErrorMock,
  isNotFoundErrorMock,
  isPreconditionFailedErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isConflictErrorMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  isPreconditionFailedErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isConflictError: isConflictErrorMock,
  isNotFoundError: isNotFoundErrorMock,
  isPreconditionFailedError: isPreconditionFailedErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  claimPendingWhatnotImportBatch,
  completeWhatnotImportBatch,
  consumeWhatnotOAuthState,
  createPendingWhatnotImportBatch,
  getLatestPendingWhatnotImportBatch,
  getWhatnotConnection,
  releaseClaimedWhatnotImportBatch,
  getWhatnotTargetMappingByMatchKeyHash,
  upsertWhatnotConnection,
  upsertWhatnotSaleImportMapping,
  upsertWhatnotTargetMapping
} from "./whatnotRepository";

function createConfig(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createEntitlementsContainer() {
  return {
    items: {
      upsert: vi.fn()
    },
    item: vi.fn()
  };
}

function createSyncSnapshotsContainer() {
  return {
    items: {
      create: vi.fn(),
      query: vi.fn(),
      upsert: vi.fn()
    },
    item: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isNotFoundErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 404 || code === 404 || code === "NotFound";
  });
  isConflictErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 409 || code === 409 || code === "Conflict";
  });
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 412 || code === 412 || code === "PreconditionFailed";
  });
});

test("getWhatnotConnection returns null for missing or invalid docs", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item
    .mockReturnValueOnce({
      read: vi.fn().mockRejectedValue({ statusCode: 404 })
    })
    .mockReturnValueOnce({
      read: vi.fn().mockResolvedValue({
        resource: {
          id: "whatnot_connection:user-1",
          docType: "wrong_doc_type"
        }
      })
    });
  getContainersMock.mockReturnValue({ entitlements, syncSnapshots: createSyncSnapshotsContainer() });

  assert.equal(await getWhatnotConnection(createConfig(), " user-1 "), null);
  assert.equal(await getWhatnotConnection(createConfig(), "user-1"), null);
  assert.deepEqual(entitlements.item.mock.calls[0], ["whatnot_connection:user-1", "user-1"]);
});

test("upsertWhatnotConnection normalizes scope fields and rewrites id and userId", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.upsert.mockImplementation(async (document: WhatnotConnectionDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements, syncSnapshots: createSyncSnapshotsContainer() });

  const result = await upsertWhatnotConnection(createConfig(), {
    id: "ignored",
    docType: "whatnot_connection",
    userId: "ignored",
    scopeKey: " ws:team-1 ",
    scopeType: "workspace",
    scopeId: "team-1",
    provider: "whatnot",
    externalAccountId: "seller-1",
    externalDisplayName: "Seller One",
    scopes: ["orders:read"],
    accessTokenCiphertext: "access",
    refreshTokenCiphertext: "refresh",
    tokenExpiresAt: "2026-04-11T12:00:00.000Z",
    connectedByUserId: "user-a",
    updatedAt: "2026-04-11T12:00:00.000Z",
    status: "active"
  });

  assert.equal(result.id, "whatnot_connection:ws:team-1");
  assert.equal(result.userId, "ws:team-1");
  assert.equal(result.scopeKey, "ws:team-1");
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.scopeKey, "ws:team-1");
});

test("consumeWhatnotOAuthState returns the document and tolerates missing delete", async () => {
  const entitlements = createEntitlementsContainer();
  const document: WhatnotOAuthStateDocument = {
    id: "whatnot_oauth_state:state-1",
    docType: "whatnot_oauth_state",
    userId: "oauth:whatnot",
    provider: "whatnot",
    state: "state-1",
    scopeKey: "user-1",
    scopeType: "user",
    scopeId: "user-1",
    createdByUserId: "user-1",
    expiresAt: "2026-04-11T13:00:00.000Z",
    createdAt: "2026-04-11T12:00:00.000Z",
    updatedAt: "2026-04-11T12:00:00.000Z"
  };
  entitlements.item.mockImplementation((_id: string, _partitionKey: string) => ({
    read: vi.fn().mockResolvedValue({ resource: document }),
    delete: vi.fn().mockRejectedValue({ statusCode: 404 })
  }));
  getContainersMock.mockReturnValue({ entitlements, syncSnapshots: createSyncSnapshotsContainer() });

  const result = await consumeWhatnotOAuthState(createConfig(), " state-1 ");

  assert.equal(result?.state, "state-1");
  assert.deepEqual(entitlements.item.mock.calls[0], ["whatnot_oauth_state:state-1", "oauth:whatnot"]);
});

test("getLatestPendingWhatnotImportBatch queries the partition and filters to valid batch docs", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const batch: WhatnotImportBatchDocument = {
    id: "whatnot_import_batch:user-1:batch-1",
    docType: "whatnot_import_batch",
    userId: "user-1",
    scopeKey: "user-1",
    provider: "whatnot",
    batchId: "batch-1",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    startedByUserId: "user-1",
    status: "pending_review",
    startedAt: "2026-04-11T12:00:00.000Z",
    updatedAt: "2026-04-11T12:00:00.000Z",
    importWindowStartedAt: "2026-04-10T00:00:00.000Z",
    importedCount: 2,
    updatedCount: 0,
    skippedCount: 0,
    rows: []
  };
  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [
        { id: "wrong", docType: "other" },
        batch
      ]
    })
  });
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await getLatestPendingWhatnotImportBatch(createConfig(), " user-1 ");

  assert.equal(result?.batchId, "batch-1");
  assert.equal(syncSnapshots.items.query.mock.calls[0]?.[1]?.partitionKey, "user-1");
  assert.equal(syncSnapshots.items.query.mock.calls[0]?.[1]?.maxItemCount, 1);
});

test("createPendingWhatnotImportBatch generates a batch id and persists pending_review state", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items.upsert.mockImplementation(async (document: WhatnotImportBatchDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await createPendingWhatnotImportBatch(createConfig(), {
    docType: "whatnot_import_batch",
    userId: "ignored",
    scopeKey: " user-1 ",
    provider: "whatnot",
    origin: "oauth_sync",
    externalAccountId: "seller-1",
    startedByUserId: "user-1",
    startedAt: "2026-04-11T12:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-04-11T12:00:00.000Z",
    importWindowStartedAt: "2026-04-10T00:00:00.000Z",
    importedCount: 4,
    updatedCount: 1,
    skippedCount: 0,
    rows: []
  });

  assert.equal(result.batchId, "batch-uuid-1");
  assert.equal(result.status, "pending_review");
  assert.equal(result.id, "whatnot_import_batch:user-1:batch-uuid-1");
});

test("upsertWhatnotTargetMapping strips matchKeyHash and getWhatnotTargetMappingByMatchKeyHash filters invalid docs", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items.upsert.mockImplementation(async (document: WhatnotTargetMappingDocument) => ({
    resource: document
  }));
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: { id: "whatnot_target_mapping:user-1:hash-1", docType: "wrong_type" }
    })
  });
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await upsertWhatnotTargetMapping(createConfig(), {
    scopeKey: " user-1 ",
    matchKeyHash: " hash-1 ",
    provider: "whatnot",
    externalAccountId: "seller-1",
    matchKey: "lot a|pack",
    lotId: "10",
    saleType: "pack",
    updatedAt: "2026-04-11T12:00:00.000Z",
    confirmedByUserId: "user-1"
  });

  assert.equal(result.id, "whatnot_target_mapping:user-1:hash-1");
  assert.equal("matchKeyHash" in (syncSnapshots.items.upsert.mock.calls[0]?.[0] as object), false);
  assert.equal(await getWhatnotTargetMappingByMatchKeyHash(createConfig(), "user-1", "hash-1"), null);
});

test("upsertWhatnotSaleImportMapping strips externalSaleKeyHash before persisting", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items.upsert.mockImplementation(async (document: WhatnotSaleImportMappingDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await upsertWhatnotSaleImportMapping(createConfig(), {
    scopeKey: " user-1 ",
    externalSaleKeyHash: " ext-hash-1 ",
    provider: "whatnot",
    externalAccountId: "seller-1",
    externalSaleId: "sale-1",
    externalOrderId: "order-1",
    externalOrderItemId: "item-1",
    lotId: "10",
    saleId: "11",
    payloadFingerprint: "fingerprint-1",
    updatedAt: "2026-04-11T12:00:00.000Z"
  });

  assert.equal(result.id, "whatnot_sale_import_mapping:user-1:ext-hash-1");
  assert.equal(result.scopeKey, "user-1");
  assert.equal("externalSaleKeyHash" in (syncSnapshots.items.upsert.mock.calls[0]?.[0] as object), false);
});

test("claimPendingWhatnotImportBatch atomically moves a pending batch to processing", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const batch: WhatnotImportBatchDocument & { _etag: string } = {
    id: "whatnot_import_batch:user-1:batch-1",
    docType: "whatnot_import_batch",
    userId: "user-1",
    scopeKey: "user-1",
    provider: "whatnot",
    batchId: "batch-1",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    startedByUserId: "user-1",
    status: "pending_review",
    startedAt: "2026-04-11T12:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-04-11T12:00:00.000Z",
    importWindowStartedAt: "2026-04-10T00:00:00.000Z",
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows: [],
    _etag: "etag-batch-1"
  };
  const replace = vi.fn(async (document: WhatnotImportBatchDocument) => ({
    resource: {
      ...document,
      _etag: "etag-batch-2"
    }
  }));
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: batch }),
    replace
  });
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await claimPendingWhatnotImportBatch(
    createConfig(),
    " user-1 ",
    " batch-1 ",
    "2026-04-11T12:01:00.000Z"
  );

  assert.equal(result.status, "claimed");
  assert.equal(result.batch?.status, "processing");
  assert.equal(replace.mock.calls.length, 1);
  assert.equal(replace.mock.calls[0]?.[0]?.status, "processing");
  assert.equal(replace.mock.calls[0]?.[0]?.updatedAt, "2026-04-11T12:01:00.000Z");
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: {
      type: "IfMatch",
      condition: "etag-batch-1"
    }
  });
});

test("claimPendingWhatnotImportBatch returns completed batches idempotently and reports claim conflicts", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const completedBatch: WhatnotImportBatchDocument & { _etag: string } = {
    id: "whatnot_import_batch:user-1:batch-1",
    docType: "whatnot_import_batch",
    userId: "user-1",
    scopeKey: "user-1",
    provider: "whatnot",
    batchId: "batch-1",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    startedByUserId: "user-1",
    status: "completed",
    startedAt: "2026-04-11T12:00:00.000Z",
    completedAt: "2026-04-11T12:02:00.000Z",
    updatedAt: "2026-04-11T12:02:00.000Z",
    importWindowStartedAt: "2026-04-10T00:00:00.000Z",
    importedCount: 2,
    updatedCount: 1,
    skippedCount: 3,
    rows: [],
    _etag: "etag-batch-1"
  };
  const pendingBatch: WhatnotImportBatchDocument & { _etag: string } = {
    ...completedBatch,
    status: "pending_review",
    completedAt: null,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0
  };
  const replace = vi.fn()
    .mockRejectedValueOnce({ statusCode: 412 });
  syncSnapshots.item
    .mockReturnValueOnce({
      read: vi.fn().mockResolvedValue({ resource: completedBatch }),
      replace
    })
    .mockReturnValue({
      read: vi.fn().mockResolvedValue({ resource: pendingBatch }),
      replace
    });
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const alreadyCompleted = await claimPendingWhatnotImportBatch(
    createConfig(),
    "user-1",
    "batch-1",
    "2026-04-11T12:03:00.000Z"
  );
  assert.equal(alreadyCompleted.status, "already_completed");
  assert.equal(alreadyCompleted.batch?.importedCount, 2);
  assert.equal(replace.mock.calls.length, 0);

  const conflicted = await claimPendingWhatnotImportBatch(
    createConfig(),
    "user-1",
    "batch-1",
    "2026-04-11T12:03:00.000Z"
  );
  assert.equal(conflicted.status, "conflict");
});

test("completeWhatnotImportBatch completes a claimed batch with If-Match", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const processingBatch: WhatnotImportBatchDocument & { _etag: string } = {
    id: "whatnot_import_batch:user-1:batch-1",
    docType: "whatnot_import_batch",
    userId: "user-1",
    scopeKey: "user-1",
    provider: "whatnot",
    batchId: "batch-1",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    startedByUserId: "user-1",
    status: "processing",
    startedAt: "2026-04-11T12:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-04-11T12:01:00.000Z",
    importWindowStartedAt: "2026-04-10T00:00:00.000Z",
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows: [],
    _etag: "etag-processing-1"
  };
  const replace = vi.fn(async (document: WhatnotImportBatchDocument) => ({ resource: document }));
  syncSnapshots.item.mockReturnValue({ replace });
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await completeWhatnotImportBatch(createConfig(), processingBatch, {
    importedCount: 2,
    updatedCount: 1,
    skippedCount: 3,
    completedAt: "2026-04-11T12:04:00.000Z"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.importedCount, 2);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.skippedCount, 3);
  assert.equal(replace.mock.calls[0]?.[0]?.completedAt, "2026-04-11T12:04:00.000Z");
  assert.equal(replace.mock.calls[0]?.[1]?.accessCondition?.condition, "etag-processing-1");

  replace.mockRejectedValueOnce({ statusCode: 412 });
  await assert.rejects(
    () => completeWhatnotImportBatch(createConfig(), processingBatch, {
      importedCount: 2,
      updatedCount: 1,
      skippedCount: 3,
      completedAt: "2026-04-11T12:05:00.000Z"
    }),
    /changed while it was being confirmed/
  );
});

test("releaseClaimedWhatnotImportBatch restores a pre-write claim with If-Match", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const processingBatch: WhatnotImportBatchDocument & { _etag: string } = {
    id: "whatnot_import_batch:user-1:batch-1",
    docType: "whatnot_import_batch",
    userId: "user-1",
    scopeKey: "user-1",
    provider: "whatnot",
    batchId: "batch-1",
    origin: "csv_manual",
    externalAccountId: "seller-1",
    startedByUserId: "user-1",
    status: "processing",
    startedAt: "2026-04-11T12:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-04-11T12:01:00.000Z",
    importWindowStartedAt: "2026-04-10T00:00:00.000Z",
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows: [],
    _etag: "etag-processing-release"
  };
  const replace = vi.fn(async (document: WhatnotImportBatchDocument) => ({ resource: document }));
  syncSnapshots.item.mockReturnValue({ replace });
  getContainersMock.mockReturnValue({ entitlements: createEntitlementsContainer(), syncSnapshots });

  const result = await releaseClaimedWhatnotImportBatch(
    createConfig(),
    processingBatch,
    "2026-04-11T12:06:00.000Z",
    "Lot 99 was not found."
  );

  assert.equal(result?.status, "pending_review");
  assert.equal(result?.updatedAt, "2026-04-11T12:06:00.000Z");
  assert.equal(result?.errorMessage, "Lot 99 was not found.");
  assert.equal(replace.mock.calls[0]?.[1]?.accessCondition?.condition, "etag-processing-release");

  replace.mockRejectedValueOnce({ statusCode: 412 });
  const conflict = await releaseClaimedWhatnotImportBatch(
    createConfig(),
    processingBatch,
    "2026-04-11T12:07:00.000Z",
    "Retry"
  );
  assert.equal(conflict, null);
});
