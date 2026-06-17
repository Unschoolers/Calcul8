import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  ApiConfig,
  EntitlementDocument,
  PlayPurchaseDocument,
  PurchaseVerificationResultDocument,
  StripeEntitlementFactDocument,
  UserProfileDocument
} from "../../types";

const {
  getContainersMock,
  isConflictErrorMock,
  isNotFoundErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isConflictErrorMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isConflictError: isConflictErrorMock,
  isNotFoundError: isNotFoundErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  claimPlayPurchaseTokenForUser,
  claimStripeWebhookEvent,
  createPurchaseVerificationResult,
  deleteEntitlement,
  deletePlayPurchasesForUser,
  deleteUserProfile,
  getEntitlement,
  getPlayPurchaseByTokenHash,
  listPlayPurchasesForUser,
  getPurchaseVerificationResult,
  getUserProfile,
  listUserProfiles,
  listStripeEntitlementFactsForUser,
  PlayPurchaseTokenConflictError,
  upsertEntitlement,
  upsertPlayPurchase,
  upsertStripeEntitlementFact,
  upsertUserProfile
} from "./entitlementRepository";

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
      upsert: vi.fn(),
      create: vi.fn(),
      query: vi.fn()
    },
    item: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isConflictErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 409;
  });
  isNotFoundErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 404;
  });
});

test("getEntitlement returns the entitlement document or null when missing", async () => {
  const entitlements = createEntitlementsContainer();
  const entitlement: EntitlementDocument = {
    id: "entitlement:user-1",
    userId: "user-1",
    hasProAccess: true,
    purchaseSource: "play",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  entitlements.item
    .mockReturnValueOnce({
      read: vi.fn().mockResolvedValue({ resource: entitlement })
    })
    .mockReturnValueOnce({
      read: vi.fn().mockRejectedValue({ statusCode: 404 })
    });
  getContainersMock.mockReturnValue({ entitlements });

  const existing = await getEntitlement(createConfig(), "user-1");
  const missing = await getEntitlement(createConfig(), "user-2");

  assert.equal(existing, entitlement);
  assert.equal(missing, null);
  assert.deepEqual(entitlements.item.mock.calls[0], ["entitlement:user-1", "user-1"]);
  assert.deepEqual(entitlements.item.mock.calls[1], ["entitlement:user-2", "user-2"]);
});

test("upsertEntitlement writes the canonical entitlement id and rejects empty responses", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.upsert
    .mockImplementationOnce(async (document: EntitlementDocument) => ({ resource: document }))
    .mockResolvedValueOnce({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await upsertEntitlement(createConfig(), {
    id: "stale-id",
    userId: "user-1",
    hasProAccess: false,
    purchaseSource: "stripe",
    updatedAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(result.id, "entitlement:user-1");
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.id, "entitlement:user-1");
  await assert.rejects(
    () => upsertEntitlement(createConfig(), {
      id: "stale-id",
      userId: "user-2",
      hasProAccess: true,
      purchaseSource: "play",
      updatedAt: "2026-03-18T00:00:00.000Z"
    }),
    /Failed to upsert entitlement\./
  );
});

test("upsertUserProfile preserves an existing user-managed display name", async () => {
  const entitlements = createEntitlementsContainer();
  const existingProfile: UserProfileDocument = {
    id: "profile:user-1",
    docType: "user_profile",
    userId: "user-1",
    displayName: "Manual Name",
    displayNameSource: "user",
    photoUrl: "https://example.test/original.png",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingProfile })
  });
  entitlements.items.upsert.mockImplementation(async (document: UserProfileDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const result = await upsertUserProfile(createConfig(), {
    userId: " user-1 ",
    displayName: "Provider Name",
    displayNameSource: "provider",
    photoUrl: "https://example.test/new.png"
  });

  assert.equal(result.displayName, "Manual Name");
  assert.equal(result.displayNameSource, "user");
  assert.equal(result.photoUrl, "https://example.test/original.png");
  assert.equal(entitlements.items.upsert.mock.calls.length, 1);
  assert.deepEqual(entitlements.items.upsert.mock.calls[0]?.[0], {
    id: "profile:user-1",
    docType: "user_profile",
    userId: "user-1",
    displayName: "Manual Name",
    displayNameSource: "user",
    photoUrl: "https://example.test/original.png",
    updatedAt: result.updatedAt
  });
});

test("upsertUserProfile writes provider managed names and keeps existing photos when omitted", async () => {
  const entitlements = createEntitlementsContainer();
  const existingProfile: UserProfileDocument = {
    id: "profile:user-1",
    docType: "user_profile",
    userId: "user-1",
    displayName: "Provider Old",
    displayNameSource: "provider",
    photoUrl: "https://example.test/existing.png",
    updatedAt: "2026-03-17T00:00:00.000Z"
  };
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingProfile })
  });
  entitlements.items.upsert.mockImplementation(async (document: UserProfileDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const result = await upsertUserProfile(createConfig(), {
    userId: "user-1",
    displayName: "Provider New",
    displayNameSource: "provider",
    photoUrl: ""
  });

  assert.equal(result.displayName, "Provider New");
  assert.equal(result.displayNameSource, "provider");
  assert.equal(result.photoUrl, "https://example.test/existing.png");
});

test("upsertUserProfile rejects empty Cosmos upsert responses", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  entitlements.items.upsert.mockResolvedValue({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => upsertUserProfile(createConfig(), {
      userId: "user-1",
      displayName: "User One",
      displayNameSource: "provider"
    }),
    /Failed to upsert user profile\./
  );
});

test("getPlayPurchaseByTokenHash queries by token hash with a single-item limit", async () => {
  const entitlements = createEntitlementsContainer();
  const purchase: PlayPurchaseDocument = {
    id: "play_purchase:hash-1",
    docType: "play_purchase",
    userId: "user-1",
    purchaseTokenHash: "hash-1",
    packageName: "io.whatfees",
    productId: "pro_access",
    orderId: "order-1",
    purchaseState: 1,
    acknowledgementState: 1,
    consumptionState: 0,
    purchaseTimeMillis: "123",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({ resources: [purchase] })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await getPlayPurchaseByTokenHash(createConfig(), "hash-1");

  assert.equal(result, purchase);
  assert.equal(entitlements.items.query.mock.calls[0]?.[1]?.maxItemCount, 1);
  assert.deepEqual(entitlements.items.query.mock.calls[0]?.[0]?.parameters, [
    { name: "@docType", value: "play_purchase" },
    { name: "@purchaseTokenHash", value: "hash-1" }
  ]);
});

test("listPlayPurchasesForUser returns an empty list when Cosmos has no rows", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({ resources: undefined })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await listPlayPurchasesForUser(createConfig(), "user-1");

  assert.deepEqual(result, []);
  assert.equal(entitlements.items.query.mock.calls[0]?.[1]?.partitionKey, "user-1");
});

test("claimPlayPurchaseTokenForUser creates a claim and reuses same-owner conflicts", async () => {
  const entitlements = createEntitlementsContainer();
  const existingClaim = {
    id: "play_purchase_token_claim:hash-1",
    docType: "play_purchase_token_claim",
    userId: "play_token:hash-1",
    ownerUserId: "user-1",
    purchaseTokenHash: "hash-1",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z"
  };
  entitlements.items.create
    .mockImplementationOnce(async (document) => ({ resource: document }))
    .mockRejectedValueOnce({ statusCode: 409 });
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingClaim })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const created = await claimPlayPurchaseTokenForUser(createConfig(), {
    userId: "user-1",
    purchaseTokenHash: "hash-1",
    createdAt: "2026-03-18T00:00:00.000Z"
  });
  const reused = await claimPlayPurchaseTokenForUser(createConfig(), {
    userId: "user-1",
    purchaseTokenHash: "hash-1",
    createdAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(created.id, "play_purchase_token_claim:hash-1");
  assert.equal(created.userId, "play_token:hash-1");
  assert.equal(reused, existingClaim);
});

test("claimPlayPurchaseTokenForUser rejects empty create responses", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create.mockResolvedValue({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => claimPlayPurchaseTokenForUser(createConfig(), {
      userId: "user-1",
      purchaseTokenHash: "hash-1",
      createdAt: "2026-03-18T00:00:00.000Z"
    }),
    /Failed to claim Play purchase token\./
  );
});

test("createPurchaseVerificationResult returns the existing row after a conflict", async () => {
  const entitlements = createEntitlementsContainer();
  const existingResult: PurchaseVerificationResultDocument = {
    id: "purchase_verify:user-1:play:idem-123",
    docType: "purchase_verification_result",
    userId: "user-1",
    provider: "play",
    idempotencyKey: "idem-123",
    responseStatus: 200,
    responseBody: { ok: true },
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingResult })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await createPurchaseVerificationResult(createConfig(), {
    userId: "user-1",
    provider: "play",
    idempotencyKey: "idem-123",
    responseStatus: 200,
    responseBody: { ok: true },
    createdAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(result, existingResult);
  assert.equal(entitlements.items.create.mock.calls.length, 1);
  assert.equal(entitlements.item.mock.calls.length, 1);
});

test("upsertPlayPurchase writes the canonical purchase id and rejects empty responses", async () => {
  const entitlements = createEntitlementsContainer();
  const purchase: PlayPurchaseDocument = {
    id: "stale-id",
    docType: "play_purchase",
    userId: "user-1",
    purchaseTokenHash: "hash-1",
    packageName: "io.whatfees",
    productId: "pro_access",
    orderId: null,
    purchaseState: 1,
    acknowledgementState: 1,
    consumptionState: 0,
    purchaseTimeMillis: "123",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  entitlements.items.upsert
    .mockImplementationOnce(async (document: PlayPurchaseDocument) => ({ resource: document }))
    .mockResolvedValueOnce({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await upsertPlayPurchase(createConfig(), purchase);

  assert.equal(result.id, "play_purchase:hash-1");
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.id, "play_purchase:hash-1");
  await assert.rejects(
    () => upsertPlayPurchase(createConfig(), { ...purchase, purchaseTokenHash: "hash-2" }),
    /Failed to upsert play purchase\./
  );
});

test("claimStripeWebhookEvent returns false when the event marker already exists", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  getContainersMock.mockReturnValue({ entitlements });

  const claimed = await claimStripeWebhookEvent(createConfig(), {
    userId: "user-1",
    stripeEventId: "evt_1",
    eventType: "checkout.session.completed",
    processedAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(claimed, false);
  assert.equal(entitlements.items.create.mock.calls.length, 1);
  assert.deepEqual(entitlements.items.create.mock.calls[0]?.[0], {
    id: "stripe_event:evt_1",
    docType: "stripe_processed_event",
    userId: "stripe_event:evt_1",
    ownerUserId: "user-1",
    stripeEventId: "evt_1",
    eventType: "checkout.session.completed",
    processedAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  });
});

test("claimStripeWebhookEvent returns true for new events and rejects empty creates", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create
    .mockImplementationOnce(async (document) => ({ resource: document }))
    .mockResolvedValueOnce({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  const claimed = await claimStripeWebhookEvent(createConfig(), {
    userId: "user-1",
    stripeEventId: "evt_1",
    eventType: "invoice.paid",
    processedAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(claimed, true);
  await assert.rejects(
    () => claimStripeWebhookEvent(createConfig(), {
      userId: "user-1",
      stripeEventId: "evt_2",
      eventType: "invoice.paid",
      processedAt: "2026-03-18T00:00:00.000Z"
    }),
    /Failed to claim Stripe webhook event\./
  );
});

test("claimPlayPurchaseTokenForUser rejects a token already claimed by another user", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "play_purchase_token_claim:hash-1",
        docType: "play_purchase_token_claim",
        userId: "play_token:hash-1",
        ownerUserId: "user-2",
        purchaseTokenHash: "hash-1",
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z"
      }
    })
  });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => claimPlayPurchaseTokenForUser(createConfig(), {
      userId: "user-1",
      purchaseTokenHash: "hash-1",
      createdAt: "2026-03-18T00:00:00.000Z"
    }),
    PlayPurchaseTokenConflictError
  );

  assert.equal(entitlements.items.create.mock.calls.length, 1);
  assert.deepEqual(entitlements.item.mock.calls[0], [
    "play_purchase_token_claim:hash-1",
    "play_token:hash-1"
  ]);
});

test("upsertStripeEntitlementFact does not regress a newer provider fact with an older event", async () => {
  const entitlements = createEntitlementsContainer();
  const existingFact: StripeEntitlementFactDocument = {
    id: "stripe_entitlement:user-1:subscription:sub_1",
    docType: "stripe_entitlement_fact",
    userId: "user-1",
    stripeObjectId: "sub_1",
    stripeObjectType: "subscription",
    active: true,
    sourceEventId: "evt_new",
    sourceEventType: "customer.subscription.updated",
    sourceEventCreated: 20,
    status: "active",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingFact })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await upsertStripeEntitlementFact(createConfig(), {
    id: "stripe_entitlement:user-1:subscription:sub_1",
    docType: "stripe_entitlement_fact",
    userId: "user-1",
    stripeObjectId: "sub_1",
    stripeObjectType: "subscription",
    active: false,
    sourceEventId: "evt_old",
    sourceEventType: "customer.subscription.deleted",
    sourceEventCreated: 10,
    status: "canceled",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z"
  });

  assert.equal(result, existingFact);
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("upsertStripeEntitlementFact preserves createdAt when updating an older fact", async () => {
  const entitlements = createEntitlementsContainer();
  const existingFact: StripeEntitlementFactDocument = {
    id: "stripe_entitlement:user-1:subscription:sub_1",
    docType: "stripe_entitlement_fact",
    userId: "user-1",
    stripeObjectId: "sub_1",
    stripeObjectType: "subscription",
    active: false,
    sourceEventId: "evt_old",
    sourceEventType: "customer.subscription.created",
    sourceEventCreated: 10,
    status: "incomplete",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z"
  };
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingFact })
  });
  entitlements.items.upsert.mockImplementation(async (document: StripeEntitlementFactDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const result = await upsertStripeEntitlementFact(createConfig(), {
    id: "ignored",
    docType: "stripe_entitlement_fact",
    userId: "user-1",
    stripeObjectId: "sub_1",
    stripeObjectType: "subscription",
    active: true,
    sourceEventId: "evt_new",
    sourceEventType: "customer.subscription.updated",
    sourceEventCreated: 20,
    status: "active",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(result.id, "stripe_entitlement:user-1:subscription:sub_1");
  assert.equal(result.createdAt, "2026-03-17T00:00:00.000Z");
  assert.equal(result.status, "active");
});

test("upsertStripeEntitlementFact returns null typed reads and rejects empty upserts", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "stripe_entitlement:user-1:subscription:sub_1",
        docType: "wrong_type"
      }
    })
  });
  entitlements.items.upsert.mockResolvedValue({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => upsertStripeEntitlementFact(createConfig(), {
      id: "ignored",
      docType: "stripe_entitlement_fact",
      userId: "user-1",
      stripeObjectId: "sub_1",
      stripeObjectType: "subscription",
      active: true,
      sourceEventId: "evt_new",
      sourceEventType: "customer.subscription.updated",
      sourceEventCreated: undefined,
      status: "active",
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z"
    }),
    /Failed to upsert Stripe entitlement fact\./
  );
});

test("listStripeEntitlementFactsForUser queries Stripe facts within the user partition", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [
        {
          id: "stripe_entitlement:user-1:subscription:sub_1",
          docType: "stripe_entitlement_fact",
          userId: "user-1",
          stripeObjectId: "sub_1",
          stripeObjectType: "subscription",
          active: true,
          sourceEventId: "evt_1",
          sourceEventType: "customer.subscription.updated",
          createdAt: "2026-03-18T00:00:00.000Z",
          updatedAt: "2026-03-18T00:00:00.000Z"
        }
      ]
    })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await listStripeEntitlementFactsForUser(createConfig(), "user-1");

  assert.equal(result.length, 1);
  assert.equal(entitlements.items.query.mock.calls[0]?.[1]?.partitionKey, "user-1");
  assert.deepEqual(entitlements.items.query.mock.calls[0]?.[0]?.parameters, [
    { name: "@userId", value: "user-1" },
    { name: "@docType", value: "stripe_entitlement_fact" }
  ]);
});

test("listStripeEntitlementFactsForUser returns an empty list when Cosmos returns no resources", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({})
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await listStripeEntitlementFactsForUser(createConfig(), "user-1");

  assert.deepEqual(result, []);
});

test("getUserProfile returns null for missing or invalid profile documents", async () => {
  const entitlements = createEntitlementsContainer();

  entitlements.item
    .mockReturnValueOnce({
      read: vi.fn().mockRejectedValue({ statusCode: 404 })
    })
    .mockReturnValueOnce({
      read: vi.fn().mockResolvedValue({
        resource: {
          id: "profile:user-1",
          docType: "not_a_profile",
          userId: "user-1"
        }
      })
    });
  getContainersMock.mockReturnValue({ entitlements });

  const missing = await getUserProfile(createConfig(), "user-1");
  const invalid = await getUserProfile(createConfig(), "user-1");

  assert.equal(missing, null);
  assert.equal(invalid, null);
});

test("listUserProfiles de-duplicates user ids and filters null results", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "profile:user-1"
        ? {
          id: "profile:user-1",
          docType: "user_profile",
          userId: "user-1",
          displayName: "User One",
          displayNameSource: "provider",
          updatedAt: "2026-03-18T00:00:00.000Z"
        }
        : null
    })
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const result = await listUserProfiles(createConfig(), ["user-1", "user-1", " ", "user-2"]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.userId, "user-1");
  assert.equal(entitlements.item.mock.calls.length, 2);
});

test("getPurchaseVerificationResult returns null for non-matching document types", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "purchase_verify:user-1:play:idem-123",
        docType: "something_else"
      }
    })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await getPurchaseVerificationResult(createConfig(), {
    userId: "user-1",
    provider: "play",
    idempotencyKey: "idem-123"
  });

  assert.equal(result, null);
});

test("getPurchaseVerificationResult returns null for missing documents", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await getPurchaseVerificationResult(createConfig(), {
    userId: "user-1",
    provider: "play",
    idempotencyKey: "idem-123"
  });

  assert.equal(result, null);
});

test("createPurchaseVerificationResult creates a new idempotency result and rejects empty creates", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create
    .mockImplementationOnce(async (document: PurchaseVerificationResultDocument) => ({ resource: document }))
    .mockResolvedValueOnce({ resource: null });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await createPurchaseVerificationResult(createConfig(), {
    userId: "user-1",
    provider: "play",
    idempotencyKey: "idem-123",
    responseStatus: 200,
    responseBody: { ok: true },
    createdAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(result.id, "purchase_verify:user-1:play:idem-123");
  assert.equal(result.updatedAt, "2026-03-18T00:00:00.000Z");
  await assert.rejects(
    () => createPurchaseVerificationResult(createConfig(), {
      userId: "user-1",
      provider: "play",
      idempotencyKey: "idem-124",
      responseStatus: 500,
      responseBody: { ok: false },
      createdAt: "2026-03-18T00:00:00.000Z"
    }),
    /Failed to create purchase verification result\./
  );
});

test("createPurchaseVerificationResult rethrows conflicts when the existing result is missing", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  entitlements.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => createPurchaseVerificationResult(createConfig(), {
      userId: "user-1",
      provider: "play",
      idempotencyKey: "idem-123",
      responseStatus: 200,
      responseBody: { ok: true },
      createdAt: "2026-03-18T00:00:00.000Z"
    }),
    (error: { statusCode?: number }) => error.statusCode === 409
  );
});

test("deleteEntitlement deletes the canonical entitlement document and ignores missing rows", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item
    .mockReturnValueOnce({
      delete: vi.fn().mockResolvedValue({})
    })
    .mockReturnValueOnce({
      delete: vi.fn().mockRejectedValue({ statusCode: 404 })
    });
  getContainersMock.mockReturnValue({ entitlements });

  await deleteEntitlement(createConfig(), "user-1");
  await deleteEntitlement(createConfig(), "user-2");

  assert.deepEqual(entitlements.item.mock.calls[0], ["entitlement:user-1", "user-1"]);
  assert.deepEqual(entitlements.item.mock.calls[1], ["entitlement:user-2", "user-2"]);
});

test("deleteUserProfile ignores missing documents", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockReturnValue({
    delete: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  getContainersMock.mockReturnValue({ entitlements });

  await deleteUserProfile(createConfig(), "user-1");

  assert.equal(entitlements.item.mock.calls.length, 1);
});

test("deleteUserProfile propagates non-missing Cosmos errors", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockReturnValue({
    delete: vi.fn().mockRejectedValue({ statusCode: 500 })
  });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => deleteUserProfile(createConfig(), "user-1"),
    (error: { statusCode?: number }) => error.statusCode === 500
  );
});

test("deletePlayPurchasesForUser deletes all rows and ignores missing ones", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [
        {
          id: "play_purchase:hash-1",
          docType: "play_purchase",
          userId: "user-1",
          purchaseTokenHash: "hash-1",
          packageName: "io.whatfees",
          productId: "pro_access",
          orderId: null,
          purchaseState: 1,
          acknowledgementState: 1,
          consumptionState: 0,
          purchaseTimeMillis: "123",
          updatedAt: "2026-03-18T00:00:00.000Z"
        },
        {
          id: "play_purchase:hash-2",
          docType: "play_purchase",
          userId: "user-1",
          purchaseTokenHash: "hash-2",
          packageName: "io.whatfees",
          productId: "pro_access",
          orderId: null,
          purchaseState: 1,
          acknowledgementState: 1,
          consumptionState: 0,
          purchaseTimeMillis: "456",
          updatedAt: "2026-03-18T00:00:00.000Z"
        }
      ]
    })
  });
  entitlements.item
    .mockReturnValueOnce({
      delete: vi.fn().mockResolvedValue({})
    })
    .mockReturnValueOnce({
      delete: vi.fn().mockRejectedValue({ statusCode: 404 })
    });
  getContainersMock.mockReturnValue({ entitlements });

  await deletePlayPurchasesForUser(createConfig(), "user-1");

  assert.equal(entitlements.item.mock.calls.length, 2);
});

test("deletePlayPurchasesForUser propagates non-missing delete failures", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [{
        id: "play_purchase:hash-1",
        docType: "play_purchase",
        userId: "user-1",
        purchaseTokenHash: "hash-1",
        packageName: "io.whatfees",
        productId: "pro_access",
        orderId: null,
        purchaseState: 1,
        acknowledgementState: 1,
        consumptionState: 0,
        purchaseTimeMillis: "123",
        updatedAt: "2026-03-18T00:00:00.000Z"
      }]
    })
  });
  entitlements.item.mockReturnValue({
    delete: vi.fn().mockRejectedValue({ statusCode: 500 })
  });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => deletePlayPurchasesForUser(createConfig(), "user-1"),
    (error: { statusCode?: number }) => error.statusCode === 500
  );
});
