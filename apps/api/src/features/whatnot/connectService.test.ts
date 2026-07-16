import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../../test-support/function-test-helpers";

const {
  buildWhatnotAuthorizeUrlMock,
  createOAuthStateTokenMock,
  createOrConsumeValidOAuthStateMock,
  createWhatnotOAuthStateMock,
  deleteWhatnotConnectionMock,
  exchangeWhatnotAuthorizationCodeMock,
  fetchWhatnotSellerIdentityMock,
  getLatestPendingWhatnotImportBatchMock,
  getWhatnotConnectionMock,
  getWhatnotImportBatchMock,
  normalizeValidatedAppReturnUrlMock,
  parseWhatnotConfiguredMock,
  resolveWhatnotAppCallbackUrlMock,
  resolveWhatnotScopeMock,
  upsertWhatnotConnectionMock
} = vi.hoisted(() => ({
  buildWhatnotAuthorizeUrlMock: vi.fn(),
  createOAuthStateTokenMock: vi.fn(),
  createOrConsumeValidOAuthStateMock: vi.fn(),
  createWhatnotOAuthStateMock: vi.fn(),
  deleteWhatnotConnectionMock: vi.fn(),
  exchangeWhatnotAuthorizationCodeMock: vi.fn(),
  fetchWhatnotSellerIdentityMock: vi.fn(),
  getLatestPendingWhatnotImportBatchMock: vi.fn(),
  getWhatnotConnectionMock: vi.fn(),
  getWhatnotImportBatchMock: vi.fn(),
  normalizeValidatedAppReturnUrlMock: vi.fn(),
  parseWhatnotConfiguredMock: vi.fn(),
  resolveWhatnotAppCallbackUrlMock: vi.fn(),
  resolveWhatnotScopeMock: vi.fn(),
  upsertWhatnotConnectionMock: vi.fn()
}));

vi.mock("../../lib/cosmos/whatnotRepository", () => ({
  createWhatnotOAuthState: createWhatnotOAuthStateMock,
  deleteWhatnotConnection: deleteWhatnotConnectionMock,
  getLatestPendingWhatnotImportBatch: getLatestPendingWhatnotImportBatchMock,
  getWhatnotConnection: getWhatnotConnectionMock,
  getWhatnotImportBatch: getWhatnotImportBatchMock,
  upsertWhatnotConnection: upsertWhatnotConnectionMock
}));

vi.mock("../../lib/whatnot", () => ({
  buildWhatnotAuthorizeUrl: buildWhatnotAuthorizeUrlMock,
  exchangeWhatnotAuthorizationCode: exchangeWhatnotAuthorizationCodeMock,
  fetchWhatnotSellerIdentity: fetchWhatnotSellerIdentityMock,
  resolveWhatnotAppCallbackUrl: resolveWhatnotAppCallbackUrlMock
}));

vi.mock("./serviceCore", async () => {
  const actual = await vi.importActual<typeof import("./serviceCore")>("./serviceCore");
  return {
    ...actual,
    createOAuthStateToken: createOAuthStateTokenMock,
    createOrConsumeValidOAuthState: createOrConsumeValidOAuthStateMock,
    normalizeValidatedAppReturnUrl: normalizeValidatedAppReturnUrlMock,
    parseWhatnotConfigured: parseWhatnotConfiguredMock,
    resolveWhatnotScope: resolveWhatnotScopeMock
  };
});

import {
  createWhatnotConnectUrlForActor,
  disconnectWhatnotForActor,
  getWhatnotReviewBatchForActor,
  getWhatnotStatusForActor,
  handleWhatnotOAuthCallback
} from "./connectService";

function userScope() {
  return {
    scopeType: "user",
    scopeId: "user-a",
    actorUserId: "user-a",
    partitionKey: "user-a",
    connectionScopeKey: "user-a"
  };
}

function workspaceScope() {
  return {
    scopeType: "workspace",
    scopeId: "team-42",
    actorUserId: "user-a",
    partitionKey: "ws:team-42",
    connectionScopeKey: "ws:team-42"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));

  parseWhatnotConfiguredMock.mockReturnValue(true);
  resolveWhatnotScopeMock.mockResolvedValue(userScope());
  createOAuthStateTokenMock.mockReturnValue("oauth-state-1");
  normalizeValidatedAppReturnUrlMock.mockImplementation((_config, rawUrl?: string) => rawUrl?.trim() || undefined);
  buildWhatnotAuthorizeUrlMock.mockReturnValue("https://whatnot.example/oauth?state=oauth-state-1");
  createOrConsumeValidOAuthStateMock.mockResolvedValue({
    provider: "whatnot",
    state: "oauth-state-1",
    scopeKey: "user-a",
    scopeType: "user",
    scopeId: "user-a",
    appReturnUrl: "https://app.example/settings",
    createdByUserId: "user-a",
    expiresAt: "2026-05-16T12:10:00.000Z",
    createdAt: "2026-05-16T12:00:00.000Z",
    updatedAt: "2026-05-16T12:00:00.000Z"
  });
  exchangeWhatnotAuthorizationCodeMock.mockResolvedValue({
    accessToken: "encrypted-access-token",
    refreshToken: "encrypted-refresh-token",
    tokenExpiresAt: "2026-05-16T13:00:00.000Z",
    scopes: ["read:orders", "read:seller"]
  });
  fetchWhatnotSellerIdentityMock.mockResolvedValue({
    externalAccountId: "seller-1",
    externalDisplayName: "Seller One"
  });
  upsertWhatnotConnectionMock.mockImplementation(async (_config, doc) => doc);
  resolveWhatnotAppCallbackUrlMock.mockImplementation((_config, status, scopeType, message, appReturnUrl) =>
    `${appReturnUrl || "https://app.example/settings"}?whatnot=${status}&scope=${scopeType}${message ? `&message=${encodeURIComponent(message)}` : ""}`
  );
});

afterEach(() => {
  vi.useRealTimers();
});

test("getWhatnotStatusForActor returns connection and pending review metadata for a scope", async () => {
  resolveWhatnotScopeMock.mockResolvedValue(workspaceScope());
  getWhatnotConnectionMock.mockResolvedValue({
    status: "active",
    externalDisplayName: "Seller One",
    externalAccountId: "seller-1",
    scopes: ["read:orders"],
    lastSyncedAt: "2026-05-15T00:00:00.000Z"
  });
  getLatestPendingWhatnotImportBatchMock.mockResolvedValue({
    batchId: "batch-1",
    rows: [{ rowId: "row-1" }, { rowId: "row-2" }]
  });

  const status = await getWhatnotStatusForActor(createApiConfig(), "user-a", "team-42");

  assert.deepEqual(resolveWhatnotScopeMock.mock.calls[0]?.slice(1), ["user-a", "team-42", false]);
  assert.deepEqual(getWhatnotConnectionMock.mock.calls[0]?.slice(1), ["ws:team-42"]);
  assert.deepEqual(getLatestPendingWhatnotImportBatchMock.mock.calls[0]?.slice(1), ["ws:team-42"]);
  assert.deepEqual(status, {
    configured: true,
    connected: true,
    displayName: "Seller One",
    externalAccountId: "seller-1",
    scopes: ["read:orders"],
    lastSyncedAt: "2026-05-15T00:00:00.000Z",
    pendingReviewCount: 2,
    pendingBatchId: "batch-1"
  });
});

test("getWhatnotStatusForActor handles inactive or missing connection data", async () => {
  parseWhatnotConfiguredMock.mockReturnValue(false);
  getWhatnotConnectionMock.mockResolvedValue({
    status: "disabled",
    externalDisplayName: undefined,
    externalAccountId: undefined,
    scopes: "bad",
    lastSyncedAt: undefined
  });
  getLatestPendingWhatnotImportBatchMock.mockResolvedValue(null);

  const status = await getWhatnotStatusForActor(createApiConfig(), "user-a");

  assert.equal(status.configured, false);
  assert.equal(status.connected, false);
  assert.equal(status.displayName, "");
  assert.equal(status.externalAccountId, "");
  assert.deepEqual(status.scopes, []);
  assert.equal(status.lastSyncedAt, null);
  assert.equal(status.pendingReviewCount, 0);
  assert.equal(status.pendingBatchId, null);
});

test("createWhatnotConnectUrlForActor rejects unconfigured integration", async () => {
  parseWhatnotConfiguredMock.mockReturnValue(false);

  await assert.rejects(
    () => createWhatnotConnectUrlForActor(createApiConfig(), "user-a"),
    (error: { status?: number; message?: string }) =>
      error.status === 503 && error.message === "Whatnot integration is not configured."
  );
  assert.equal(createWhatnotOAuthStateMock.mock.calls.length, 0);
});

test("createWhatnotConnectUrlForActor stores a scoped OAuth state before building the authorize URL", async () => {
  resolveWhatnotScopeMock.mockResolvedValue(workspaceScope());

  const authorizeUrl = await createWhatnotConnectUrlForActor(
    createApiConfig(),
    "user-a",
    "team-42",
    " https://app.example/settings "
  );

  assert.equal(authorizeUrl, "https://whatnot.example/oauth?state=oauth-state-1");
  assert.deepEqual(resolveWhatnotScopeMock.mock.calls[0]?.slice(1), ["user-a", "team-42", true]);
  assert.deepEqual(normalizeValidatedAppReturnUrlMock.mock.calls[0]?.slice(1), [" https://app.example/settings "]);
  assert.deepEqual(createWhatnotOAuthStateMock.mock.calls[0]?.[1], {
    provider: "whatnot",
    state: "oauth-state-1",
    scopeKey: "ws:team-42",
    scopeType: "workspace",
    scopeId: "team-42",
    appReturnUrl: "https://app.example/settings",
    createdByUserId: "user-a",
    expiresAt: "2026-05-16T12:10:00.000Z",
    createdAt: "2026-05-16T12:00:00.000Z",
    updatedAt: "2026-05-16T12:00:00.000Z"
  });
  assert.deepEqual(buildWhatnotAuthorizeUrlMock.mock.calls[0]?.slice(1), ["oauth-state-1"]);
});

test("handleWhatnotOAuthCallback redirects OAuth errors with the callback state when available", async () => {
  createOrConsumeValidOAuthStateMock.mockResolvedValue({
    scopeKey: "ws:team-42",
    scopeType: "workspace",
    scopeId: "team-42",
    appReturnUrl: "https://app.example/workspace",
    createdByUserId: "user-a"
  });

  const result = await handleWhatnotOAuthCallback(createApiConfig(), {
    state: " oauth-state-1 ",
    error: "access_denied",
    errorDescription: "Seller cancelled"
  });

  assert.equal(createOrConsumeValidOAuthStateMock.mock.calls[0]?.[1], "oauth-state-1");
  assert.deepEqual(resolveWhatnotAppCallbackUrlMock.mock.calls[0]?.slice(1), [
    "error",
    "workspace",
    "Seller cancelled",
    "https://app.example/workspace"
  ]);
  assert.equal(result.redirectUrl, "https://app.example/workspace?whatnot=error&scope=workspace&message=Seller%20cancelled");
});

test("handleWhatnotOAuthCallback falls back to the default personal callback for unavailable error states", async () => {
  createOrConsumeValidOAuthStateMock.mockRejectedValue(new Error("gone"));

  const result = await handleWhatnotOAuthCallback(createApiConfig(), {
    state: "missing-state",
    error: "access_denied"
  });

  assert.deepEqual(resolveWhatnotAppCallbackUrlMock.mock.calls[0]?.slice(1), [
    "error",
    "user",
    "access_denied",
    undefined
  ]);
  assert.equal(result.redirectUrl, "https://app.example/settings?whatnot=error&scope=user&message=access_denied");
});

test("handleWhatnotOAuthCallback rejects missing code or state before token exchange", async () => {
  await assert.rejects(
    () => handleWhatnotOAuthCallback(createApiConfig(), {
      state: "state-only"
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 400 && error.message === "Whatnot OAuth callback is missing required parameters."
  );
  assert.equal(exchangeWhatnotAuthorizationCodeMock.mock.calls.length, 0);
});

test("handleWhatnotOAuthCallback exchanges code, stores the seller connection, and redirects", async () => {
  const result = await handleWhatnotOAuthCallback(createApiConfig(), {
    state: " oauth-state-1 ",
    code: " code-1 "
  });

  assert.equal(createOrConsumeValidOAuthStateMock.mock.calls[0]?.[1], "oauth-state-1");
  assert.deepEqual(exchangeWhatnotAuthorizationCodeMock.mock.calls[0]?.slice(1), ["code-1"]);
  assert.deepEqual(fetchWhatnotSellerIdentityMock.mock.calls[0]?.slice(1), ["encrypted-access-token"]);
  assert.deepEqual(upsertWhatnotConnectionMock.mock.calls[0]?.[1], {
    id: "",
    docType: "whatnot_connection",
    userId: "user-a",
    scopeKey: "user-a",
    scopeType: "user",
    scopeId: "user-a",
    provider: "whatnot",
    externalAccountId: "seller-1",
    externalDisplayName: "Seller One",
    scopes: ["read:orders", "read:seller"],
    accessTokenCiphertext: "encrypted-access-token",
    refreshTokenCiphertext: "encrypted-refresh-token",
    tokenExpiresAt: "2026-05-16T13:00:00.000Z",
    connectedByUserId: "user-a",
    updatedAt: "2026-05-16T12:00:00.000Z",
    status: "active"
  });
  assert.deepEqual(resolveWhatnotAppCallbackUrlMock.mock.calls[0]?.slice(1), [
    "connected",
    "user",
    undefined,
    "https://app.example/settings"
  ]);
  assert.equal(result.redirectUrl, "https://app.example/settings?whatnot=connected&scope=user");
});

test("handleWhatnotOAuthCallback rechecks workspace ownership before storing credentials", async () => {
  createOrConsumeValidOAuthStateMock.mockResolvedValue({
    provider: "whatnot",
    state: "oauth-state-1",
    scopeKey: "ws:team-42",
    scopeType: "workspace",
    scopeId: "team-42",
    createdByUserId: "user-a",
    expiresAt: "2026-05-16T12:10:00.000Z",
    createdAt: "2026-05-16T12:00:00.000Z",
    updatedAt: "2026-05-16T12:00:00.000Z"
  });
  resolveWhatnotScopeMock.mockRejectedValueOnce(Object.assign(new Error("Owner access required."), { status: 403 }));

  await assert.rejects(
    () => handleWhatnotOAuthCallback(createApiConfig(), { state: "oauth-state-1", code: "code-1" }),
    (error: { status?: number }) => error.status === 403
  );

  assert.deepEqual(resolveWhatnotScopeMock.mock.calls[0]?.slice(1), ["user-a", "team-42", true]);
  assert.equal(exchangeWhatnotAuthorizationCodeMock.mock.calls.length, 0);
  assert.equal(upsertWhatnotConnectionMock.mock.calls.length, 0);
});

test("disconnectWhatnotForActor requires workspace owner scope when disconnecting a workspace integration", async () => {
  resolveWhatnotScopeMock.mockResolvedValue(workspaceScope());

  await disconnectWhatnotForActor(createApiConfig(), "user-a", "team-42");

  assert.deepEqual(resolveWhatnotScopeMock.mock.calls[0]?.slice(1), ["user-a", "team-42", true]);
  assert.deepEqual(deleteWhatnotConnectionMock.mock.calls[0]?.slice(1), ["ws:team-42"]);
});

test("getWhatnotReviewBatchForActor loads explicit batches or the latest pending batch for the scope", async () => {
  resolveWhatnotScopeMock.mockResolvedValue(workspaceScope());
  getWhatnotImportBatchMock.mockResolvedValue({ batchId: "batch-2" });
  getLatestPendingWhatnotImportBatchMock.mockResolvedValue({ batchId: "latest-batch" });

  const explicitBatch = await getWhatnotReviewBatchForActor(createApiConfig(), "user-a", "team-42", " batch-2 ");
  const latestBatch = await getWhatnotReviewBatchForActor(createApiConfig(), "user-a", "team-42", "   ");

  assert.deepEqual(resolveWhatnotScopeMock.mock.calls[0]?.slice(1), ["user-a", "team-42", false]);
  assert.deepEqual(getWhatnotImportBatchMock.mock.calls[0]?.slice(1), ["ws:team-42", "batch-2"]);
  assert.deepEqual(getLatestPendingWhatnotImportBatchMock.mock.calls[0]?.slice(1), ["ws:team-42"]);
  assert.equal((explicitBatch as { batchId: string }).batchId, "batch-2");
  assert.equal((latestBatch as { batchId: string }).batchId, "latest-batch");
});
