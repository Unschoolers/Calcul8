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
      gameType: "wheel",
      sessionStatus: "starting",
      totalSpins: 0,
      lastResultLabel: "",
      lastResultColor: "#d4af37",
      wheelCurrentAngle: 0,
      wheelSlots: [],
      gridCells: [],
      gridHighlightCellIndex: -1,
      gridResetAnimating: false,
      recentFairnessHistory: [],
      chaseHistory: [],
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null,
      fairnessVerificationUrl: null,
      snapshotVersion: 1,
      updatedAt: 123
    }
  });
  updateWheelPublicSessionMock.mockResolvedValue({
    ownerUserId: "user-a",
    publicSessionId: "abc123xy",
    snapshot: {
      wheelName: "Demo Wheel",
      gameType: "wheel",
      sessionStatus: "live",
      totalSpins: 1,
      lastResultLabel: "Prize",
      lastResultColor: "#f00",
      wheelCurrentAngle: 1.25,
      wheelSlots: [],
      gridCells: [],
      gridHighlightCellIndex: -1,
      gridResetAnimating: false,
      recentFairnessHistory: [],
      chaseHistory: [],
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null,
      fairnessVerificationUrl: null,
      snapshotVersion: 1,
      updatedAt: 456
    }
  });
  getWheelPublicSessionMock.mockResolvedValue({
    ownerUserId: "user-a",
    publicSessionId: "abc123xy",
    snapshot: {
      wheelName: "Demo Wheel",
      gameType: "wheel",
      sessionStatus: "ended",
      totalSpins: 2,
      lastResultLabel: "Prize",
      lastResultColor: "#f00",
      wheelCurrentAngle: 1.5,
      wheelSlots: [],
      gridCells: [],
      gridHighlightCellIndex: -1,
      gridResetAnimating: false,
      recentFairnessHistory: [],
      chaseHistory: [],
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null,
      fairnessVerificationUrl: null,
      snapshotVersion: 1,
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
        gameType: "grid",
        sessionStatus: "banana",
        totalSpins: "-7",
        lastResultLabel: "Prize",
        lastResultColor: "",
        wheelCurrentAngle: "1.5",
        spinAnimation: {
          spinId: "spin-abc",
          startedAt: "2000",
          durationMs: "4500",
          startAngle: "0.25",
          endAngle: "18.5",
          targetIndex: "3"
        },
        wheelSlots: [{
          name: "Tier 1",
          color: "#f00",
          tier: "tier-1",
          isChase: true
        }],
        gridCells: [{
          index: "4",
          revealed: true,
          label: "Chase",
          color: "#0f0",
          tier: "tier-2",
          slotIndex: "12"
        }, {
          index: "5",
          revealed: false,
          label: "hidden",
          color: "#f00",
          tier: "hidden",
          slotIndex: "13"
        }],
        gridHighlightCellIndex: "5",
        gridResetAnimating: true,
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
      gameName: string;
      gameType: string;
      sessionStatus: string;
      sessionResultCount: number;
      lastResultColor: string;
      gameCurrentAngle: number;
      resultAnimation: {
        spinId: string;
        startedAt: number;
        durationMs: number;
        startAngle: number;
        endAngle: number;
        targetIndex: number;
      } | null;
      outcomeSlots: Array<{ name: string; tier: string; isChase: boolean }>;
      boardCells: Array<{ index: number; revealed: boolean; label: string; color: string; tier: string; slotIndex: number }>;
      boardHighlightCellIndex: number;
      boardResetAnimating: boolean;
      featuredChaseHeat: string | null;
      snapshotVersion: number;
      recentFairnessHistory: Array<{ spinNumber: number; timestamp: number }>;
      chaseHistory: Array<{ count: number }>;
      chaseBoard: Array<{ status: string; hitCount: number; remainingHits: number | null }>;
    };
  };

  assert.equal(repoInput.scopeType, "workspace");
  assert.equal(repoInput.scopeId, "team-42");
  assert.equal(repoInput.snapshot.gameName.length, 119);
  assert.equal(repoInput.snapshot.gameType, "grid");
  assert.equal(repoInput.snapshot.sessionStatus, "starting");
  assert.equal(repoInput.snapshot.sessionResultCount, 0);
  assert.equal(repoInput.snapshot.lastResultColor, "#d4af37");
  assert.equal(repoInput.snapshot.gameCurrentAngle, 1.5);
  assert.deepEqual(repoInput.snapshot.resultAnimation, {
    spinId: "spin-abc",
    startedAt: 2000,
    durationMs: 4500,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 3
  });
  assert.equal(repoInput.snapshot.outcomeSlots[0]?.name, "Tier 1");
  assert.equal(repoInput.snapshot.outcomeSlots[0]?.tier, "tier-1");
  assert.equal(repoInput.snapshot.outcomeSlots[0]?.isChase, true);
  assert.deepEqual(repoInput.snapshot.boardCells, [{
    index: 4,
    revealed: true,
    label: "Chase",
    color: "#0f0",
    tier: "tier-2",
    slotIndex: 12
  }, {
    index: 5,
    revealed: false,
    label: "",
    color: "",
    tier: "",
    slotIndex: 13
  }]);
  assert.equal(repoInput.snapshot.boardHighlightCellIndex, 5);
  assert.equal(repoInput.snapshot.boardResetAnimating, true);
  assert.equal(repoInput.snapshot.featuredChaseHeat, "medium");
  assert.equal(repoInput.snapshot.snapshotVersion, 2);
  assert.equal(repoInput.snapshot.recentFairnessHistory[0]?.spinNumber, 2);
  assert.equal(repoInput.snapshot.recentFairnessHistory[0]?.timestamp, 55);
  assert.equal(repoInput.snapshot.chaseHistory[0]?.count, 2);
  assert.equal(repoInput.snapshot.chaseBoard[0]?.status, "claimed");
  assert.equal(repoInput.snapshot.chaseBoard[0]?.hitCount, 2);
  assert.equal(repoInput.snapshot.chaseBoard[0]?.remainingHits, 0);
  assert.equal(Object.hasOwn(repoInput.snapshot, "wheelName"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "totalSpins"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "wheelCurrentAngle"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "wheelSlots"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "gridCells"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "spinAnimation"), false);
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
        gameType: "wheel",
        sessionStatus: "live",
        totalSpins: 1,
        lastResultLabel: "Prize",
        lastResultColor: "#f00",
        wheelCurrentAngle: 1.25,
        wheelSlots: [],
        gridCells: [],
        gridHighlightCellIndex: -1,
        gridResetAnimating: false,
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

test("wheelPublicSessionPublish upgrades old wheel-only snapshots at the API boundary", async () => {
  const rawSnapshot = {
    wheelName: "Old Wheel",
    sessionStatus: "live",
    totalSpins: "4",
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    wheelCurrentAngle: "2.5",
    wheelSlots: [{
      name: "Prize",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    updatedAt: 456
  };

  await wheelPublicSessionPublish(createHttpRequest({
    method: "POST",
    headers: {
      authorization: "Bearer user-a"
    },
    body: {
      publicSessionId: "abc123xy",
      snapshot: rawSnapshot
    }
  }) as never, createInvocationContext() as never);

  const repoInput = updateWheelPublicSessionMock.mock.calls.at(-1)?.[1] as {
    snapshot: {
      snapshotVersion: number;
      gameName: string;
      gameType: string;
      boardCells: unknown[];
      boardHighlightCellIndex: number;
      boardResetAnimating: boolean;
      sessionResultCount: number;
      gameCurrentAngle: number;
      outcomeSlots: Array<{ name: string; color: string; tier: string; isChase: boolean }>;
    };
  };

  assert.equal(repoInput.snapshot.snapshotVersion, 2);
  assert.equal(repoInput.snapshot.gameName, "Old Wheel");
  assert.equal(repoInput.snapshot.gameType, "wheel");
  assert.equal(repoInput.snapshot.sessionResultCount, 4);
  assert.equal(repoInput.snapshot.gameCurrentAngle, 2.5);
  assert.deepEqual(repoInput.snapshot.outcomeSlots, [{
    name: "Prize",
    color: "#f00",
    tier: "tier-1",
    isChase: false
  }]);
  assert.deepEqual(repoInput.snapshot.boardCells, []);
  assert.equal(repoInput.snapshot.boardHighlightCellIndex, -1);
  assert.equal(repoInput.snapshot.boardResetAnimating, false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "wheelName"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "totalSpins"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "wheelCurrentAngle"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "wheelSlots"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "gridCells"), false);
  assert.equal(Object.hasOwn(repoInput.snapshot, "spinAnimation"), false);
});

test("wheelPublicSessionPublish normalizes malformed public payloads like the shared spectator contract", async () => {
  const rawSnapshot = {
    gameType: "banana",
    gridCells: [{ index: -1 }, { index: "2", revealed: true }],
    spinAnimation: {
      spinId: "spin-1",
      startedAt: "2000",
      durationMs: "45000",
      startAngle: "0.25",
      endAngle: "18.5",
      targetIndex: "3"
    },
    featuredChaseHeat: "burning",
    updatedAt: "999"
  };

  await wheelPublicSessionPublish(createHttpRequest({
    method: "POST",
    headers: {
      authorization: "Bearer user-a"
    },
    body: {
      publicSessionId: "abc123xy",
      snapshot: rawSnapshot
    }
  }) as never, createInvocationContext() as never);

  const repoInput = updateWheelPublicSessionMock.mock.calls.at(-1)?.[1] as {
    snapshot: {
      gameType: string;
      boardCells: Array<{ index: number; revealed: boolean; label: string; color: string; tier: string; slotIndex: number }>;
      resultAnimation: {
        spinId: string;
        startedAt: number;
        durationMs: number;
        startAngle: number;
        endAngle: number;
        targetIndex: number;
      } | null;
      featuredChaseHeat: string | null;
      updatedAt: number;
    };
  };

  assert.equal(repoInput.snapshot.gameType, "grid");
  assert.deepEqual(repoInput.snapshot.boardCells, [
    { index: 2, revealed: true, label: "", color: "#d4af37", tier: "", slotIndex: -1 }
  ]);
  assert.deepEqual(repoInput.snapshot.resultAnimation, {
    spinId: "spin-1",
    startedAt: 2000,
    durationMs: 30_000,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 3
  });
  assert.equal(repoInput.snapshot.featuredChaseHeat, null);
  assert.equal(repoInput.snapshot.updatedAt, 999);
});

test("wheelPublicSessionPublish preserves bracket public snapshots at the API boundary", async () => {
  await wheelPublicSessionPublish(createHttpRequest({
    method: "POST",
    headers: {
      authorization: "Bearer user-a"
    },
    body: {
      publicSessionId: "abc123xy",
      snapshot: {
        gameName: "Bracket Night",
        gameType: "bracket",
        sessionStatus: "live",
        isSpinning: true,
        sessionResultCount: 1,
        bracket: {
          status: "active",
          participantCount: "4",
          activeMatchId: "match-2",
          championParticipantId: "",
          activeMatch: {
            id: "match-2",
            round: "1",
            position: "2",
            status: "active",
            participantAId: "a",
            participantALabel: " Alex ",
            participantAResult: "5",
            participantBId: "b",
            participantBLabel: " Bri ",
            participantBResult: "3",
            winnerParticipantId: "",
            prizeId: "prize-1",
            prizeLabel: "Top Prize"
          },
          matches: [{
            id: "match-2",
            round: "1",
            position: "2",
            status: "active",
            participantAId: "a",
            participantALabel: " Alex ",
            participantAResult: "5",
            participantBId: "b",
            participantBLabel: " Bri ",
            participantBResult: "3",
            winnerParticipantId: "",
            prizeId: "prize-1",
            prizeLabel: "Top Prize"
          }],
          recentRolls: [{
            id: "roll-1",
            matchId: "match-2",
            participantId: "a",
            participantLabel: "Alex",
            value: "5",
            rolledAt: "123"
          }],
          awards: [{
            id: "award-1",
            matchId: "match-1",
            participantId: "winner-1",
            participantLabel: "Winner",
            prizeId: "prize-2",
            prizeLabel: "Bonus",
            awardedAt: "456"
          }],
        },
        updatedAt: 1234
      }
    }
  }) as never, createInvocationContext() as never);

  const repoInput = updateWheelPublicSessionMock.mock.calls.at(-1)?.[1] as {
    snapshot: {
      gameType: string;
      bracket: {
        status: string;
        participantCount: number;
        activeMatch: { id: string; participantALabel: string; participantAResult: number } | null;
        matches: Array<{ id: string; participantBLabel: string; participantBResult: number }>;
        recentRolls: Array<{ value: number; rollNumber: number; tiebreakerIndex: number }>;
        awards: Array<{ prizeLabel: string; settlementStatus: string }>;
      } | null;
    };
  };

  assert.equal(repoInput.snapshot.gameType, "bracket");
  assert.equal(repoInput.snapshot.bracket?.status, "active");
  assert.equal(repoInput.snapshot.bracket?.participantCount, 4);
  assert.equal(repoInput.snapshot.bracket?.activeMatch?.id, "match-2");
  assert.equal(repoInput.snapshot.bracket?.activeMatch?.participantALabel, "Alex");
  assert.equal(repoInput.snapshot.bracket?.activeMatch?.participantAResult, 5);
  assert.equal(repoInput.snapshot.bracket?.matches[0]?.participantBLabel, "Bri");
  assert.equal(repoInput.snapshot.bracket?.matches[0]?.participantBResult, 3);
  assert.equal(repoInput.snapshot.bracket?.recentRolls[0]?.value, 5);
  assert.equal(repoInput.snapshot.bracket?.recentRolls[0]?.rollNumber, 0);
  assert.equal(repoInput.snapshot.bracket?.recentRolls[0]?.tiebreakerIndex, 0);
  assert.equal(repoInput.snapshot.bracket?.awards[0]?.prizeLabel, "Bonus");
  assert.equal(repoInput.snapshot.bracket?.awards[0]?.settlementStatus, "pending");
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
        gameType: "wheel",
        sessionStatus: "live",
        totalSpins: 1,
        lastResultLabel: "Prize",
        lastResultColor: "#f00",
        wheelCurrentAngle: 1.25,
        wheelSlots: [],
        gridCells: [],
        gridHighlightCellIndex: -1,
        gridResetAnimating: false,
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
    data: { publicSessionId: string; snapshot: { sessionStatus: string; snapshotVersion: number; gameName: string } };
  };
  assert.equal(publishArgs.publicSessionId, "abc123xy");
  assert.equal(publishArgs.eventType, "wheel.public-session.updated");
  assert.equal(publishArgs.data.snapshot.sessionStatus, "live");
  assert.equal(publishArgs.data.snapshot.snapshotVersion, 2);
  assert.equal(publishArgs.data.snapshot.gameName, "Demo Wheel");
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

test("wheelPublicSessionGet normalizes stored legacy snapshots before returning them", async () => {
  const legacySnapshot = {
    wheelName: "Stored Wheel",
    sessionStatus: "live",
    totalSpins: "6",
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    wheelCurrentAngle: "3.5",
    wheelSlots: [{
      name: "Prize",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    updatedAt: 777
  };
  getWheelPublicSessionMock.mockResolvedValueOnce({
    ownerUserId: "user-a",
    publicSessionId: "abc123xy",
    snapshot: legacySnapshot
  });

  const response = await wheelPublicSessionGet(createHttpRequest({
    method: "GET",
    params: {
      publicSessionId: "AbC123xY"
    }
  }) as never, createInvocationContext() as never);

  assert.equal(response.status, 200);
  const snapshot = (response.jsonBody as {
    snapshot: {
      snapshotVersion: number;
      gameName: string;
      sessionResultCount: number;
      gameCurrentAngle: number;
      outcomeSlots: Array<{ name: string; color: string; tier: string; isChase: boolean }>;
      boardCells: unknown[];
    };
  }).snapshot;
  assert.equal(snapshot.snapshotVersion, 2);
  assert.equal(snapshot.gameName, "Stored Wheel");
  assert.equal(snapshot.sessionResultCount, 6);
  assert.equal(snapshot.gameCurrentAngle, 3.5);
  assert.deepEqual(snapshot.outcomeSlots, [{
    name: "Prize",
    color: "#f00",
    tier: "tier-1",
    isChase: false
  }]);
  assert.deepEqual(snapshot.boardCells, []);
  assert.equal(Object.hasOwn(snapshot, "wheelName"), false);
  assert.equal(Object.hasOwn(snapshot, "totalSpins"), false);
  assert.equal(Object.hasOwn(snapshot, "wheelSlots"), false);
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
