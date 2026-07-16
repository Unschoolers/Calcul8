import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, RefreshSessionDocument } from "../../types";

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

import { RefreshSessionConflictError, rotateRefreshSession } from "./sessionRepository";

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

function createRefreshSession(): RefreshSessionDocument & { _etag: string } {
  return {
    id: "refresh-1",
    docType: "refresh_session",
    userId: "user-1",
    tokenHash: "old-token-hash",
    sessionId: "session-old",
    createdAt: "2026-07-01T00:00:00.000Z",
    lastUsedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    revokedAt: null,
    _etag: "etag-refresh-1"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isConflictErrorMock.mockImplementation((error: unknown) => (
    (error as { statusCode?: unknown })?.statusCode === 409
  ));
  isNotFoundErrorMock.mockReturnValue(false);
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => (
    (error as { statusCode?: unknown })?.statusCode === 412
  ));
});

test("rotateRefreshSession consumes the expected token version with If-Match", async () => {
  const existing = createRefreshSession();
  const replace = vi.fn(async (document: RefreshSessionDocument, _options?: unknown) => ({ resource: document }));
  const read = vi.fn().mockResolvedValue({ resource: existing });
  const upsert = vi.fn();
  const item = vi.fn().mockReturnValue({ read, replace });
  getContainersMock.mockReturnValue({
    sessions: {
      items: { upsert },
      item
    }
  });

  await rotateRefreshSession(createConfig(), {
    refreshSessionId: "refresh-1",
    expectedTokenHash: "old-token-hash",
    tokenHash: "new-token-hash",
    sessionId: "session-new",
    lastUsedAt: "2026-07-16T12:00:00.000Z"
  });

  assert.equal(upsert.mock.calls.length, 0);
  assert.equal(replace.mock.calls.length, 1);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: {
      type: "IfMatch",
      condition: "etag-refresh-1"
    }
  });
});

test("rotateRefreshSession rejects a token that changed before the conditional write", async () => {
  const existing = createRefreshSession();
  const replace = vi.fn();
  const item = vi.fn().mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({
    sessions: {
      items: { upsert: vi.fn() },
      item
    }
  });

  await assert.rejects(
    () => rotateRefreshSession(createConfig(), {
      refreshSessionId: "refresh-1",
      expectedTokenHash: "stale-token-hash",
      tokenHash: "new-token-hash",
      sessionId: "session-new",
      lastUsedAt: "2026-07-16T12:00:00.000Z"
    }),
    RefreshSessionConflictError
  );
  assert.equal(replace.mock.calls.length, 0);
});

test("rotateRefreshSession translates an If-Match race into a refresh conflict", async () => {
  const existing = createRefreshSession();
  const replace = vi.fn().mockRejectedValue({ statusCode: 412 });
  const item = vi.fn().mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({
    sessions: {
      items: { upsert: vi.fn() },
      item
    }
  });

  await assert.rejects(
    () => rotateRefreshSession(createConfig(), {
      refreshSessionId: "refresh-1",
      expectedTokenHash: "old-token-hash",
      tokenHash: "new-token-hash",
      sessionId: "session-new",
      lastUsedAt: "2026-07-16T12:00:00.000Z"
    }),
    RefreshSessionConflictError
  );
});
