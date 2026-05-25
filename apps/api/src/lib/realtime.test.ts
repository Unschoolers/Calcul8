import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../test-support/function-test-helpers";
import {
  buildGamePublicSessionRealtimeRoom,
  buildWheelPublicSessionRealtimeRoom,
  buildWorkspaceLotRealtimeRoom,
  buildWorkspacePresenceRealtimeRoom,
  buildWorkspaceWheelRealtimeRoom,
  getRealtimeRoomMemberCountStatus,
  publishGamePublicSessionRealtimeEvent,
  publishWheelPublicSessionRealtimeEvent,
  publishWorkspaceLotRealtimeEvent,
  publishWorkspaceLotRealtimeEventBestEffort,
  publishWorkspaceWheelRealtimeEvent,
  signRealtimeSubscribeToken
} from "./realtime";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("realtime room helpers build workspace lot, presence, and wheel room names", () => {
  assert.equal(buildWorkspaceLotRealtimeRoom("team-42", "10"), "workspace:team-42:lot:10");
  assert.equal(buildWorkspacePresenceRealtimeRoom("team-42"), "workspace:team-42:presence");
  assert.equal(buildWorkspaceWheelRealtimeRoom("team-42"), "workspace:team-42:wheel");
  assert.equal(buildGamePublicSessionRealtimeRoom("abc123xy"), "wheel-public:abc123xy");
  assert.equal(buildWheelPublicSessionRealtimeRoom("abc123xy"), "wheel-public:abc123xy");
});

test("signRealtimeSubscribeToken normalizes payload fields", () => {
  const token = signRealtimeSubscribeToken("secret", {
    rooms: [" room-a ", "", "room-b"],
    userId: " user-a ",
    exp: 123.9
  });

  const [encodedPayload, signature] = token.split(".");
  const decodedPayload = JSON.parse(Buffer.from(String(encodedPayload), "base64url").toString("utf8")) as {
    rooms: string[];
    userId?: string;
    exp?: number;
  };

  assert.match(String(signature), /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodedPayload, {
    rooms: ["room-a", "room-b"],
    userId: "user-a",
    exp: 123
  });
});

test("publishWorkspaceLotRealtimeEvent short-circuits when workspace or realtime config is missing", async () => {
  const config = createApiConfig({
    realtimePublishUrl: "",
    realtimeInternalApiKey: ""
  });

  assert.equal(await publishWorkspaceLotRealtimeEvent(config, {
    workspaceId: "",
    lotId: "10",
    eventType: "sale.upserted"
  }), false);

  globalThis.fetch = vi.fn();
  assert.equal(await publishWorkspaceLotRealtimeEvent(config, {
    workspaceId: "team-42",
    lotId: "10",
    eventType: "sale.upserted"
  }), false);
  assert.equal((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("publishWorkspaceLotRealtimeEvent posts lot events to the configured publish url", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const config = createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish///",
    realtimeInternalApiKey: "internal-key"
  });

  const result = await publishWorkspaceLotRealtimeEvent(config, {
    workspaceId: "team-42",
    lotId: "10",
    eventType: "sale.upserted",
    data: { saleId: "11" }
  });

  assert.equal(result, true);
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(fetchMock.mock.calls[0]?.[0], "https://ws.example/internal/publish");
  const requestInit = fetchMock.mock.calls[0]?.[1] as {
    method: string;
    headers: Record<string, string>;
    body: string;
  };
  assert.equal(requestInit.method, "POST");
  assert.equal(requestInit.headers.Authorization, "Bearer internal-key");
  assert.deepEqual(JSON.parse(requestInit.body), {
    room: "workspace:team-42:lot:10",
    eventType: "sale.upserted",
    data: { saleId: "11" }
  });
});

test("publishWorkspaceLotRealtimeEvent warns and returns false on non-ok response", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 503
  });
  globalThis.fetch = fetchMock as typeof fetch;
  const logger = { warn: vi.fn() };

  const result = await publishWorkspaceLotRealtimeEvent(createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: "internal-key"
  }), {
    workspaceId: "team-42",
    lotId: "10",
    eventType: "sale.upserted",
    logger
  });

  assert.equal(result, false);
  assert.equal(logger.warn.mock.calls.length, 1);
  assert.match(String(logger.warn.mock.calls[0]?.[0]), /workspace team-42 lot 10 \(503\)/);
});

test("publishWorkspaceWheelRealtimeEvent uses default prod url and logs thrown publish errors", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
  globalThis.fetch = fetchMock as typeof fetch;
  const logger = { warn: vi.fn() };

  const result = await publishWorkspaceWheelRealtimeEvent(createApiConfig({
    apiEnv: "prod",
    realtimeInternalApiKey: "internal-key"
  }), {
    workspaceId: "team-42",
    eventType: "wheel.session.updated",
    data: { wheelTotalSpins: 7 },
    logger
  });

  assert.equal(result, false);
  assert.equal(fetchMock.mock.calls[0]?.[0], "https://ws.whatfees.ca/internal/publish");
  const requestInit = fetchMock.mock.calls[0]?.[1] as { body: string };
  assert.deepEqual(JSON.parse(requestInit.body), {
    room: "workspace:team-42:wheel",
    eventType: "wheel.session.updated",
    data: { wheelTotalSpins: 7 }
  });
  assert.equal(logger.warn.mock.calls.length, 1);
  assert.match(String(logger.warn.mock.calls[0]?.[0]), /workspace team-42 wheel: network down/);
});

test("publishWheelPublicSessionRealtimeEvent posts spectator updates to the configured publish url", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const config = createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: "internal-key"
  });

  const result = await publishWheelPublicSessionRealtimeEvent(config, {
    publicSessionId: "abc123xy",
    eventType: "wheel.public-session.updated",
    data: { publicSessionId: "abc123xy" }
  });

  assert.equal(result, true);
  const requestInit = fetchMock.mock.calls[0]?.[1] as { body: string };
  assert.deepEqual(JSON.parse(requestInit.body), {
    room: "wheel-public:abc123xy",
    eventType: "wheel.public-session.updated",
    data: { publicSessionId: "abc123xy" }
  });
});

test("publishGamePublicSessionRealtimeEvent posts spectator updates through the compatible public room", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const config = createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: "internal-key"
  });

  const result = await publishGamePublicSessionRealtimeEvent(config, {
    publicSessionId: " AbC123xY ",
    eventType: "game.public-session.updated",
    data: { publicSessionId: "abc123xy", snapshot: { gameType: "bracket" } }
  });

  assert.equal(result, true);
  const requestInit = fetchMock.mock.calls[0]?.[1] as { body: string };
  assert.deepEqual(JSON.parse(requestInit.body), {
    room: "wheel-public:abc123xy",
    eventType: "game.public-session.updated",
    data: { publicSessionId: "abc123xy", snapshot: { gameType: "bracket" } }
  });
});

test("getRealtimeRoomMemberCountStatus reads counts from the internal room-count endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ count: 3.8 })
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await getRealtimeRoomMemberCountStatus(createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: "internal-key"
  }), {
    room: "wheel-public:abc123xy"
  });

  assert.deepEqual(result, {
    available: true,
    count: 3
  });
  assert.equal(fetchMock.mock.calls[0]?.[0], "https://ws.example/internal/room-count");
  const requestInit = fetchMock.mock.calls[0]?.[1] as {
    method: string;
    headers: Record<string, string>;
    body: string;
  };
  assert.equal(requestInit.method, "POST");
  assert.equal(requestInit.headers.Authorization, "Bearer internal-key");
  assert.deepEqual(JSON.parse(requestInit.body), {
    room: "wheel-public:abc123xy"
  });
});

test("getRealtimeRoomMemberCountStatus reports non-secret unavailable reasons", async () => {
  globalThis.fetch = vi.fn();

  const notConfigured = await getRealtimeRoomMemberCountStatus(createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: ""
  }), {
    room: "wheel-public:abc123xy"
  });
  assert.deepEqual(notConfigured, {
    available: false,
    reason: "not_configured"
  });
  assert.equal((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 401
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const unauthorized = await getRealtimeRoomMemberCountStatus(createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: "wrong-key"
  }), {
    room: "wheel-public:abc123xy"
  });
  assert.deepEqual(unauthorized, {
    available: false,
    reason: "unauthorized",
    status: 401
  });
});

test("publishWorkspaceLotRealtimeEventBestEffort schedules publish without throwing", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true
  });
  globalThis.fetch = fetchMock as typeof fetch;

  publishWorkspaceLotRealtimeEventBestEffort(createApiConfig({
    realtimePublishUrl: "https://ws.example/internal/publish",
    realtimeInternalApiKey: "internal-key"
  }), {
    workspaceId: "team-42",
    lotId: "10",
    eventType: "sale.upserted"
  });

  await Promise.resolve();
  assert.equal(fetchMock.mock.calls.length, 1);
});
