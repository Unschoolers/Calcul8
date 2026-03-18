import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, PurchaseVerificationResultDocument, UserProfileDocument } from "../../types";

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
  createPurchaseVerificationResult,
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
