import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, BuyerProfileDocument } from "../../types";

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
  BuyerProfileVersionConflictError,
  deleteBuyerProfile,
  listBuyerProfiles,
  upsertBuyerProfile
} from "./buyerProfileRepository";

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

function createSyncSnapshotsContainer() {
  return {
    items: {
      create: vi.fn(),
      query: vi.fn()
    },
    item: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isNotFoundErrorMock.mockImplementation((error: unknown) => (
    (error as { statusCode?: unknown })?.statusCode === 404
  ));
  isConflictErrorMock.mockImplementation((error: unknown) => (
    (error as { statusCode?: unknown })?.statusCode === 409
  ));
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => (
    (error as { statusCode?: unknown })?.statusCode === 412
  ));
});

test("creates a normalized scoped buyer profile with server-managed metadata", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  syncSnapshots.items.create.mockImplementation(async (document: BuyerProfileDocument) => ({ resource: document }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const profile = await upsertBuyerProfile(createConfig(), {
    scopeKey: " workspace:w1 ",
    username: " CardKing27 ",
    preferredName: " Marc ",
    tags: ["VIP", "vip", " Pokémon "],
    updatedBy: " user-1 ",
    mutationId: " buyer:create ",
    baseVersion: 0
  });

  assert.equal(profile.docType, "buyer_profile");
  assert.equal(profile.userId, "workspace:w1");
  assert.equal(profile.username, "CardKing27");
  assert.equal(profile.normalizedUsername, "cardking27");
  assert.equal(profile.preferredName, "Marc");
  assert.deepEqual(profile.tags, ["VIP", "Pokémon"]);
  assert.equal(profile.updatedBy, "user-1");
  assert.equal(profile.mutationId, "buyer:create");
  assert.equal(profile.version, 1);
  assert.match(profile.id, /^buyer_profile:[a-f0-9]{32}$/);
  assert.equal(profile.createdAt, profile.updatedAt);
});

test("returns an existing profile unchanged for a repeated mutation", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existing: BuyerProfileDocument = {
    id: "buyer_profile:abc",
    docType: "buyer_profile",
    userId: "workspace:w1",
    username: "cardking27",
    normalizedUsername: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "buyer:same",
    version: 2
  };
  const replace = vi.fn();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const profile = await upsertBuyerProfile(createConfig(), {
    scopeKey: "workspace:w1",
    username: "cardking27",
    preferredName: "Different",
    tags: [],
    updatedBy: "user-2",
    mutationId: "buyer:same",
    baseVersion: 1
  });

  assert.equal(profile, existing);
  assert.equal(replace.mock.calls.length, 0);
});

test("conditionally replaces a current profile and rejects stale versions", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existing: BuyerProfileDocument & { _etag: string } = {
    id: "buyer_profile:abc",
    docType: "buyer_profile",
    userId: "workspace:w1",
    username: "cardking27",
    normalizedUsername: "cardking27",
    tags: [],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "buyer:first",
    version: 2,
    _etag: "etag-2"
  };
  const replace = vi.fn(async (document: BuyerProfileDocument) => ({ resource: document }));
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const updated = await upsertBuyerProfile(createConfig(), {
    scopeKey: "workspace:w1",
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    updatedBy: "user-2",
    mutationId: "buyer:second",
    baseVersion: 2
  });

  assert.equal(updated.version, 3);
  assert.equal(updated.createdAt, existing.createdAt);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: { type: "IfMatch", condition: "etag-2" }
  });

  await assert.rejects(
    () => upsertBuyerProfile(createConfig(), {
      scopeKey: "workspace:w1",
      username: "cardking27",
      tags: [],
      updatedBy: "user-2",
      mutationId: "buyer:stale",
      baseVersion: 1
    }),
    BuyerProfileVersionConflictError
  );
});

test("lists only active buyer profiles in a scope", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const active = {
    id: "buyer_profile:a",
    docType: "buyer_profile",
    userId: "workspace:w1",
    username: "Alice",
    normalizedUsername: "alice",
    tags: [],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "m1",
    version: 1
  } satisfies BuyerProfileDocument;
  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [active, { ...active, id: "buyer_profile:b", username: "Bob", deletedAt: "2026-07-20T11:00:00.000Z" }]
    })
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const profiles = await listBuyerProfiles(createConfig(), "workspace:w1");

  assert.deepEqual(profiles, [active]);
  assert.deepEqual(syncSnapshots.items.query.mock.calls[0]?.[1], {
    partitionKey: "workspace:w1"
  });
});

test("soft-deletes a profile with optimistic concurrency", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existing: BuyerProfileDocument & { _etag: string } = {
    id: "buyer_profile:abc",
    docType: "buyer_profile",
    userId: "workspace:w1",
    username: "cardking27",
    normalizedUsername: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "buyer:first",
    version: 2,
    _etag: "etag-2"
  };
  const replace = vi.fn(async (document: BuyerProfileDocument) => ({ resource: document }));
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const deleted = await deleteBuyerProfile(createConfig(), {
    scopeKey: "workspace:w1",
    username: "cardking27",
    updatedBy: "user-2",
    mutationId: "buyer:delete",
    baseVersion: 2
  });

  assert.equal(deleted?.version, 3);
  assert.ok(deleted?.deletedAt);
  assert.equal(deleted?.preferredName, undefined);
  assert.deepEqual(deleted?.tags, []);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: { type: "IfMatch", condition: "etag-2" }
  });
});
