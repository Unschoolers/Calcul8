import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
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
  publishWorkspaceWheelRealtimeEventMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  publishWorkspaceWheelRealtimeEventMock: vi.fn()
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

vi.mock("../lib/realtime", async () => {
  const actual = await vi.importActual<typeof import("../lib/realtime")>("../lib/realtime");
  return {
    ...actual,
    publishWorkspaceWheelRealtimeEvent: publishWorkspaceWheelRealtimeEventMock,
    publishWorkspaceWheelRealtimeEventBestEffort: vi.fn((config: unknown, args: unknown) => {
      void publishWorkspaceWheelRealtimeEventMock(config, args).catch(() => false);
    })
  };
});

import { wheelBroadcast } from "./wheelBroadcast";

function createRequest(body?: unknown) {
  return createHttpRequest({
    method: "POST",
    body,
    headers: {
      authorization: "Bearer user-a"
    }
  });
}

function createContext() {
  return createInvocationContext();
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  resolveUserIdMock.mockResolvedValue("user-a");
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  publishWorkspaceWheelRealtimeEventMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("wheelBroadcast publishes sanitized wheel session data for workspace members", async () => {
  const response = await wheelBroadcast(
    createRequest({
      workspaceId: "team-42",
      session: {
        wheelConfigs: Array.from({ length: 101 }, (_, index) => ({ id: index + 1 })),
        activeWheelConfigId: "77",
        wheelTotalSpins: "-12",
        wheelSpinCounts: [1, "2", -3, "banana"],
        wheelSessionNetRevenue: "61.1",
        wheelSessionCostAdjustment: "4",
        wheelFairnessHistory: [{
          spinNumber: 3,
          label: "Prize",
          color: "#f00",
          hash: "hash-3",
          seed: "seed-3",
          clientSeed: "client-3",
          verificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=seed-3&clientSeed=client-3&slotCount=15",
          algorithm: "whatfees-wheel-v1",
          timestamp: 333
        }],
        wheelChaseTallyHistory: [{
          tierId: "tier-1",
          label: "Tier One",
          color: "#0f0",
          count: "2"
        }],
        wheelCurrentAngle: "1.25",
        wheelLastResult: "x".repeat(250),
        wheelLastResultColor: "#ff0000",
        wheelSessionUpdatedAt: "12345",
        wheelPendingInventoryIssues: Array.from({ length: 3 }, (_, index) => ({ slotIndex: index })),
        wheelSkippedDeductions: Array.from({ length: 501 }, (_, index) => index)
      }
    }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[1], "user-a");
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[2], "team-42");
  assert.equal(publishWorkspaceWheelRealtimeEventMock.mock.calls.length, 1);

  const publishArgs = publishWorkspaceWheelRealtimeEventMock.mock.calls[0]?.[1] as {
    workspaceId: string;
    eventType: string;
    data: {
      wheelConfigs: Array<{ id: number }>;
      activeWheelConfigId: number | null;
      wheelTotalSpins: number;
      wheelSpinCounts: number[];
      wheelSessionNetRevenue: number | null;
      wheelSessionCostAdjustment: number;
      wheelFairnessHistory: Array<{ clientSeed?: string; verificationUrl?: string; algorithm?: string }>;
      wheelChaseTallyHistory: Array<{ tierId: string; count: number }>;
      wheelCurrentAngle: number;
      wheelLastResult: string;
      wheelLastResultColor: string;
      wheelSessionUpdatedAt: number;
      wheelPendingInventoryIssues: unknown[];
      wheelSkippedDeductions: number[];
    };
  };

  assert.equal(publishArgs.workspaceId, "team-42");
  assert.equal(publishArgs.eventType, "wheel.session.updated");
  assert.equal(publishArgs.data.wheelConfigs.length, 100);
  assert.equal(publishArgs.data.activeWheelConfigId, 77);
  assert.equal(publishArgs.data.wheelTotalSpins, 0);
  assert.deepEqual(publishArgs.data.wheelSpinCounts, [1, 2, 0, 0]);
  assert.equal(publishArgs.data.wheelSessionNetRevenue, 61.1);
  assert.equal(publishArgs.data.wheelSessionCostAdjustment, 4);
  assert.equal(publishArgs.data.wheelFairnessHistory[0]?.clientSeed, "client-3");
  assert.equal(publishArgs.data.wheelFairnessHistory[0]?.algorithm, "whatfees-wheel-v1");
  assert.match(String(publishArgs.data.wheelFairnessHistory[0]?.verificationUrl || ""), /wheel\/fairness\/verify/);
  assert.deepEqual(publishArgs.data.wheelChaseTallyHistory, [{
    tierId: "tier-1",
    label: "Tier One",
    color: "#0f0",
    count: 2
  }]);
  assert.equal(publishArgs.data.wheelCurrentAngle, 1.25);
  assert.equal(publishArgs.data.wheelLastResult.length, 200);
  assert.equal(publishArgs.data.wheelLastResultColor, "#ff0000");
  assert.equal(publishArgs.data.wheelSessionUpdatedAt, 12345);
  assert.equal(publishArgs.data.wheelPendingInventoryIssues.length, 3);
  assert.equal(publishArgs.data.wheelSkippedDeductions.length, 500);
});

test("wheelBroadcast validates required workspaceId and session body", async () => {
  const missingWorkspaceResponse = await wheelBroadcast(
    createRequest({
      session: {}
    }) as never,
    createContext() as never
  );

  assert.equal(missingWorkspaceResponse.status, 400);
  assert.equal(
    (missingWorkspaceResponse.jsonBody as { error: string }).error,
    "Field 'workspaceId' is required."
  );

  const invalidSessionResponse = await wheelBroadcast(
    createRequest({
      workspaceId: "team-42",
      session: []
    }) as never,
    createContext() as never
  );

  assert.equal(invalidSessionResponse.status, 400);
  assert.equal(
    (invalidSessionResponse.jsonBody as { error: string }).error,
    "Field 'session' is required and must be an object."
  );
  assert.equal(publishWorkspaceWheelRealtimeEventMock.mock.calls.length, 0);
});

test("wheelBroadcast rejects non-members from workspace broadcasts", async () => {
  hasWorkspaceMembershipMock.mockResolvedValue(false);
  const context = createContext();

  const response = await wheelBroadcast(
    createRequest({
      workspaceId: "team-42",
      session: {
        wheelTotalSpins: 5
      }
    }) as never,
    context as never
  );

  assert.equal(response.status, 403);
  assert.equal((response.jsonBody as { error: string }).error, "User is not a member of this workspace.");
  assert.equal(publishWorkspaceWheelRealtimeEventMock.mock.calls.length, 0);
  assert.equal(context.error.mock.calls.length, 1);
  assert.equal(context.error.mock.calls[0]?.[0], "Failed to broadcast wheel session.");
});
