import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
    createApiConfig,
    createHttpRequest,
    createInvocationContext
} from "../test-support/function-test-helpers";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  resolveUserIdMock,
  hasWorkspaceMembershipMock,
  createWheelPublicSessionMock,
  getWheelPublicSessionMock,
  updateWheelPublicSessionMock,
  buildWheelPublicSessionRealtimeRoomMock,
  getRealtimeRoomMemberCountMock,
  signRealtimeSubscribeTokenMock,
  publishWheelPublicSessionRealtimeEventBestEffortMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  createWheelPublicSessionMock: vi.fn(),
  getWheelPublicSessionMock: vi.fn(),
  updateWheelPublicSessionMock: vi.fn(),
  buildWheelPublicSessionRealtimeRoomMock: vi.fn(),
  getRealtimeRoomMemberCountMock: vi.fn(),
  signRealtimeSubscribeTokenMock: vi.fn(),
  publishWheelPublicSessionRealtimeEventBestEffortMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return {
    ...actual,
    resolveUserId: resolveUserIdMock
  };
});

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

vi.mock("../lib/cosmos/wheelPublicSessionRepository", () => ({
  createWheelPublicSession: createWheelPublicSessionMock,
  getWheelPublicSession: getWheelPublicSessionMock,
  updateWheelPublicSession: updateWheelPublicSessionMock
}));

vi.mock("../lib/realtime", () => ({
  buildWheelPublicSessionRealtimeRoom: buildWheelPublicSessionRealtimeRoomMock,
  getRealtimeRoomMemberCount: getRealtimeRoomMemberCountMock,
  signRealtimeSubscribeToken: signRealtimeSubscribeTokenMock,
  publishWheelPublicSessionRealtimeEventBestEffort: publishWheelPublicSessionRealtimeEventBestEffortMock
}));

import {
    wheelPublicSessionCreate,
    wheelPublicSessionGet,
    wheelPublicSessionPublish,
    wheelPublicSessionRealtimeTokenGet,
    wheelPublicSessionSpectatorCountGet
} from "./wheelPublicSession";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig({
    realtimeTokenSecret: "test-secret"
  }));
  resolveUserIdMock.mockResolvedValue("user-a");
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  buildWheelPublicSessionRealtimeRoomMock.mockImplementation((publicSessionId: string) => `wheel-public:${publicSessionId}`);
  signRealtimeSubscribeTokenMock.mockReturnValue("signed-token");
  getRealtimeRoomMemberCountMock.mockResolvedValue(4);
  createWheelPublicSessionMock.mockResolvedValue({
    ownerUserId: "user-a",
    publicSessionId: "abc123xy",
    snapshot: {
      wheelName: "Demo Wheel",
      sessionStatus: "starting",
      totalSpins: 0,
      lastResultLabel: "",
      lastResultColor: "#d4af37",
      wheelCurrentAngle: 0,
      wheelSlots: [],
      recentFairnessHistory: [],
      chaseHistory: [],
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null,
      fairnessVerificationUrl: null,
      updatedAt: 123
    }
  });
  updateWheelPublicSessionMock.mockResolvedValue({
    ownerUserId: "user-a",
    publicSessionId: "abc123xy",
    snapshot: {
      wheelName: "Demo Wheel",
      sessionStatus: "live",
      totalSpins: 1,
      lastResultLabel: "Prize",
      lastResultColor: "#f00",
      wheelCurrentAngle: 1.25,
      wheelSlots: [],
      recentFairnessHistory: [],
      chaseHistory: [],
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null,
      fairnessVerificationUrl: null,
      updatedAt: 456
    }
  });
  getWheelPublicSessionMock.mockResolvedValue({
    ownerUserId: "user-a",
    publicSessionId: "abc123xy",
    snapshot: {
      wheelName: "Demo Wheel",
      sessionStatus: "ended",
      totalSpins: 2,
      lastResultLabel: "Prize",
      lastResultColor: "#f00",
      wheelCurrentAngle: 1.5,
      wheelSlots: [],
      recentFairnessHistory: [],
      chaseHistory: [],
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null,
      fairnessVerificationUrl: null,
      updatedAt: 789
    }
  });
});

test("wheelPublicSessionCreate sanitizes the snapshot and verifies workspace access", async () => {
  const response = await wheelPublicSessionCreate(createHttpRequest({
    method: "POST",
    headers: {
      authorization: "Bearer user-a"
    },
    body: {
      workspaceId: "team-42",
      snapshot: {
        wheelName: ` Demo Wheel ${"x".repeat(180)}`,
        sessionStatus: "banana",
        totalSpins: "-7",
        lastResultLabel: "Prize",
        lastResultColor: "",
        wheelCurrentAngle: "1.5",
        wheelSlots: [{
          name: "Tier 1",
          color: "#f00",
          tier: "tier-1",
          isChase: true
        }],
        recentFairnessHistory: [{
          spinNumber: "2",
          label: "Prize",
          color: "#f00",
          verificationUrl: "https://api.example.test/proof",
          timestamp: "55"
        }],
        chaseHistory: [{
          tierId: "tier-1",
          label: "Chase",
          color: "#0f0",
          count: "2"
        }],
        chaseBoard: [{
          tierId: "tier-1",
          label: "Chase",
          color: "#0f0",
          status: "claimed",
          hitCount: "2",
          slots: "1",
          remainingHits: "0",
          isFeatured: true
        }],
        featuredChaseLabel: "Chase",
        featuredChaseHeat: "medium",
        fairnessVerificationUrl: "https://api.example.test/latest",
        updatedAt: "1234"
      }
    }
  }) as never, createInvocationContext() as never);

  assert.equal(response.status, 200);
  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[1], "user-a");
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[2], "team-42");
  assert.equal(createWheelPublicSessionMock.mock.calls.length, 1);

  const repoInput = createWheelPublicSessionMock.mock.calls[0]?.[1] as {
    scopeType: string;
    scopeId: string;
    snapshot: {
      wheelName: string;
      sessionStatus: string;
      totalSpins: number;
      lastResultColor: string;
        wheelCurrentAngle: number;
      wheelSlots: Array<{ name: string; tier: string; isChase: boolean }>;
      featuredChaseHeat: string | null;
      recentFairnessHistory: Array<{ spinNumber: number; timestamp: number }>;
      chaseHistory: Array<{ count: number }>;
      chaseBoard: Array<{ status: string; hitCount: number; remainingHits: number | null }>;
    };
  };

  assert.equal(repoInput.scopeType, "workspace");
  assert.equal(repoInput.scopeId, "team-42");
  assert.equal(repoInput.snapshot.wheelName.length, 119);
  assert.equal(repoInput.snapshot.sessionStatus, "starting");
  assert.equal(repoInput.snapshot.totalSpins, 0);
  assert.equal(repoInput.snapshot.lastResultColor, "#d4af37");
  assert.equal(repoInput.snapshot.wheelCurrentAngle, 1.5);
  assert.equal(repoInput.snapshot.wheelSlots[0]?.name, "Tier 1");
  assert.equal(repoInput.snapshot.wheelSlots[0]?.tier, "tier-1");
  assert.equal(repoInput.snapshot.wheelSlots[0]?.isChase, true);
  assert.equal(repoInput.snapshot.featuredChaseHeat, "medium");
  assert.equal(repoInput.snapshot.recentFairnessHistory[0]?.spinNumber, 2);
  assert.equal(repoInput.snapshot.recentFairnessHistory[0]?.timestamp, 55);
  assert.equal(repoInput.snapshot.chaseHistory[0]?.count, 2);
  assert.equal(repoInput.snapshot.chaseBoard[0]?.status, "claimed");
  assert.equal(repoInput.snapshot.chaseBoard[0]?.hitCount, 2);
  assert.equal(repoInput.snapshot.chaseBoard[0]?.remainingHits, 0);
});

test("wheelPublicSessionPublish returns 404 when the session is missing or not owned by the actor", async () => {
  updateWheelPublicSessionMock.mockResolvedValue(null);

  const response = await wheelPublicSessionPublish(createHttpRequest({
    method: "POST",
    headers: {
      authorization: "Bearer user-a"
    },
    body: {
      publicSessionId: "abc123xy",
      snapshot: {
        wheelName: "Demo Wheel",
        sessionStatus: "live",
        totalSpins: 1,
        lastResultLabel: "Prize",
        lastResultColor: "#f00",
        wheelCurrentAngle: 1.25,
        wheelSlots: [],
        recentFairnessHistory: [],
        chaseHistory: [],
        chaseBoard: [],
        featuredChaseLabel: null,
        featuredChaseHeat: null,
        fairnessVerificationUrl: null,
        updatedAt: 456
      }
    }
  }) as never, createInvocationContext() as never);

  assert.equal(response.status, 404);
  assert.equal((response.jsonBody as { error: string }).error, "Public wheel session was not found.");
});

test("wheelPublicSessionPublish fans out the sanitized snapshot over realtime after save", async () => {
  const response = await wheelPublicSessionPublish(createHttpRequest({
    method: "POST",
    headers: {
      authorization: "Bearer user-a"
    },
    body: {
      publicSessionId: "abc123xy",
      snapshot: {
        wheelName: "Demo Wheel",
        sessionStatus: "live",
        totalSpins: 1,
        lastResultLabel: "Prize",
        lastResultColor: "#f00",
        wheelCurrentAngle: 1.25,
        wheelSlots: [],
        recentFairnessHistory: [],
        chaseHistory: [],
        chaseBoard: [],
        featuredChaseLabel: null,
        featuredChaseHeat: null,
        fairnessVerificationUrl: null,
        updatedAt: 456
      }
    }
  }) as never, createInvocationContext() as never);

  assert.equal(response.status, 200);
  assert.equal(publishWheelPublicSessionRealtimeEventBestEffortMock.mock.calls.length, 1);
  const publishArgs = publishWheelPublicSessionRealtimeEventBestEffortMock.mock.calls[0]?.[1] as {
    publicSessionId: string;
    eventType: string;
    data: { publicSessionId: string; snapshot: { sessionStatus: string } };
  };
  assert.equal(publishArgs.publicSessionId, "abc123xy");
  assert.equal(publishArgs.eventType, "wheel.public-session.updated");
  assert.equal(publishArgs.data.snapshot.sessionStatus, "live");
});

test("wheelPublicSessionGet serves the stored public snapshot and reports 404 when missing", async () => {
  const successResponse = await wheelPublicSessionGet(createHttpRequest({
    method: "GET",
    params: {
      publicSessionId: "AbC123xY"
    }
  }) as never, createInvocationContext() as never);

  assert.equal(successResponse.status, 200);
  assert.equal(getWheelPublicSessionMock.mock.calls[0]?.[1], "abc123xy");
  assert.equal((successResponse.jsonBody as { snapshot: { sessionStatus: string } }).snapshot.sessionStatus, "ended");

  getWheelPublicSessionMock.mockResolvedValueOnce(null);
  const missingResponse = await wheelPublicSessionGet(createHttpRequest({
    method: "GET",
    params: {
      publicSessionId: "missing"
    }
  }) as never, createInvocationContext() as never);

  assert.equal(missingResponse.status, 404);
  assert.equal((missingResponse.jsonBody as { error: string }).error, "Public wheel session was not found.");
});

test("wheelPublicSessionRealtimeTokenGet returns a room-scoped public subscribe token", async () => {
  const response = await wheelPublicSessionRealtimeTokenGet(createHttpRequest({
    method: "GET",
    params: {
      publicSessionId: "AbC123xY"
    }
  }) as never, createInvocationContext() as never);

  assert.equal(response.status, 200);
  assert.equal(buildWheelPublicSessionRealtimeRoomMock.mock.calls[0]?.[0], "abc123xy");
  assert.equal(signRealtimeSubscribeTokenMock.mock.calls.length, 1);
  const body = response.jsonBody as {
    publicSessionId: string;
    room: string;
    rooms: string[];
    token: string;
    expiresAt: number;
  };
  assert.equal(body.publicSessionId, "abc123xy");
  assert.equal(body.room, "wheel-public:abc123xy");
  assert.deepEqual(body.rooms, ["wheel-public:abc123xy"]);
  assert.equal(body.token, "signed-token");
  assert.equal(Number.isFinite(body.expiresAt), true);
});

test("wheelPublicSessionSpectatorCountGet returns the live spectator count for the owner", async () => {
  const response = await wheelPublicSessionSpectatorCountGet(createHttpRequest({
    method: "GET",
    headers: {
      authorization: "Bearer user-a"
    },
    params: {
      publicSessionId: "AbC123xY"
    }
  }) as never, createInvocationContext() as never);

  assert.equal(response.status, 200);
  assert.equal(buildWheelPublicSessionRealtimeRoomMock.mock.calls.at(-1)?.[0], "abc123xy");
  assert.equal(getRealtimeRoomMemberCountMock.mock.calls.length, 1);
  const body = response.jsonBody as { publicSessionId: string; spectatorCount: number };
  assert.equal(body.publicSessionId, "abc123xy");
  assert.equal(body.spectatorCount, 4);
});
