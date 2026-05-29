import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, GamePublicSessionDocument, GamePublicSessionSnapshot } from "../../types";

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
  GamePublicSessionConflictError,
  updateGamePublicSession
} from "./gamePublicSessionRepository";

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

function createSessionsContainer() {
  return {
    items: {
      create: vi.fn(),
      upsert: vi.fn()
    },
    item: vi.fn()
  };
}

function createSnapshot(overrides: Partial<GamePublicSessionSnapshot> = {}): GamePublicSessionSnapshot {
  return {
    snapshotVersion: 2,
    gameName: "Demo Wheel",
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 1,
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    gameCurrentAngle: 0,
    outcomeSlots: [],
    boardCells: [],
    boardHighlightCellIndex: -1,
    boardResetAnimating: false,
    resultAnimation: null,
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    bracket: null,
    updatedAt: 100,
    ...overrides
  };
}

function createSessionDocument(
  overrides: Partial<GamePublicSessionDocument> = {},
  snapshotOverrides: Partial<GamePublicSessionSnapshot> = {}
): GamePublicSessionDocument & { _etag: string } {
  return {
    id: "wheel_public_session:abc123xy",
    docType: "wheel_public_session",
    publicSessionId: "abc123xy",
    ownerUserId: "user-a",
    scopeType: "user",
    scopeId: "user-a",
    workspaceId: null,
    createdAt: "2026-05-29T12:00:00.000Z",
    updatedAt: "2026-05-29T12:00:00.000Z",
    endedAt: null,
    snapshot: createSnapshot(snapshotOverrides),
    _etag: "etag-session-1",
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isNotFoundErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 404;
  });
  isConflictErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 409;
  });
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 412;
  });
});

test("updateGamePublicSession replaces the stored session with If-Match", async () => {
  const sessions = createSessionsContainer();
  const existing = createSessionDocument({}, { updatedAt: 100 });
  const replace = vi.fn(async (document: GamePublicSessionDocument) => ({ resource: document }));
  sessions.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ sessions });

  const result = await updateGamePublicSession(createConfig(), {
    publicSessionId: "abc123xy",
    ownerUserId: "user-a",
    snapshot: createSnapshot({ sessionResultCount: 2, updatedAt: 150 })
  });

  assert.equal(result?.snapshot.sessionResultCount, 2);
  assert.equal(sessions.items.upsert.mock.calls.length, 0);
  assert.equal(replace.mock.calls.length, 1);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: {
      type: "IfMatch",
      condition: "etag-session-1"
    }
  });
});

test("updateGamePublicSession rejects stale snapshots before replacing", async () => {
  const sessions = createSessionsContainer();
  const existing = createSessionDocument({}, { updatedAt: 200 });
  const replace = vi.fn();
  sessions.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ sessions });

  await assert.rejects(
    () => updateGamePublicSession(createConfig(), {
      publicSessionId: "abc123xy",
      ownerUserId: "user-a",
      snapshot: createSnapshot({ updatedAt: 100 })
    }),
    (error: unknown) => {
      assert.ok(error instanceof GamePublicSessionConflictError);
      assert.equal(error.message, "Public game session changed since it was last published.");
      return true;
    }
  );
  assert.equal(replace.mock.calls.length, 0);
});

test("updateGamePublicSession does not move an ended session back to live", async () => {
  const sessions = createSessionsContainer();
  const existing = createSessionDocument({
    endedAt: "2026-05-29T12:05:00.000Z"
  }, {
    sessionStatus: "ended",
    updatedAt: 200
  });
  const replace = vi.fn();
  sessions.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ sessions });

  await assert.rejects(
    () => updateGamePublicSession(createConfig(), {
      publicSessionId: "abc123xy",
      ownerUserId: "user-a",
      snapshot: createSnapshot({ sessionStatus: "live", updatedAt: 300 })
    }),
    (error: unknown) => {
      assert.ok(error instanceof GamePublicSessionConflictError);
      assert.equal(error.message, "Ended public game sessions cannot be restarted.");
      return true;
    }
  );
  assert.equal(replace.mock.calls.length, 0);
});

test("updateGamePublicSession maps Cosmos write conflicts to public-session conflicts", async () => {
  const sessions = createSessionsContainer();
  const existing = createSessionDocument({}, { updatedAt: 100 });
  const replace = vi.fn().mockRejectedValue({ statusCode: 412 });
  sessions.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existing }),
    replace
  });
  getContainersMock.mockReturnValue({ sessions });

  await assert.rejects(
    () => updateGamePublicSession(createConfig(), {
      publicSessionId: "abc123xy",
      ownerUserId: "user-a",
      snapshot: createSnapshot({ updatedAt: 150 })
    }),
    (error: unknown) => {
      assert.ok(error instanceof GamePublicSessionConflictError);
      assert.equal(error.message, "Public game session changed since it was last published.");
      return true;
    }
  );
});
