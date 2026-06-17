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
  hasWorkspaceMembershipMock,
  listSalesForLotMock,
  listSalesForScopeMock,
  getLotSalesSyncMetaMock,
  upsertSaleDocumentMock,
  deleteSaleDocumentMock,
  getLotLivePricingMock,
  upsertLotLivePricingMock,
  publishWorkspaceLotRealtimeEventMock,
  EntityVersionConflictErrorMock,
  resolveUserIdMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  listSalesForLotMock: vi.fn(),
  listSalesForScopeMock: vi.fn(),
  getLotSalesSyncMetaMock: vi.fn(),
  upsertSaleDocumentMock: vi.fn(),
  deleteSaleDocumentMock: vi.fn(),
  getLotLivePricingMock: vi.fn(),
  upsertLotLivePricingMock: vi.fn(),
  publishWorkspaceLotRealtimeEventMock: vi.fn(),
  EntityVersionConflictErrorMock: class EntityVersionConflictError extends Error {},
  resolveUserIdMock: vi.fn(async (request: { headers: { get(name: string): string | null } }) => {
    const authHeader = request.headers.get("authorization") || "";
    return authHeader.replace(/^Bearer\s+/i, "").trim() || "test-user";
  })
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/salesRepository", () => ({
  EntityVersionConflictError: EntityVersionConflictErrorMock,
  listSalesForLot: listSalesForLotMock,
  listSalesForScope: listSalesForScopeMock,
  getLotSalesSyncMeta: getLotSalesSyncMetaMock,
  upsertSaleDocument: upsertSaleDocumentMock,
  deleteSaleDocument: deleteSaleDocumentMock,
  getLotLivePricing: getLotLivePricingMock,
  upsertLotLivePricing: upsertLotLivePricingMock
}));

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

vi.mock("../lib/realtime", () => ({
  buildWorkspaceLotRealtimeRoom: (workspaceId: string, lotId: string) => `workspace:${workspaceId}:lot:${lotId}`,
  buildWorkspacePresenceRealtimeRoom: (workspaceId: string) => `workspace:${workspaceId}:presence`,
  buildWorkspaceWheelRealtimeRoom: (workspaceId: string) => `workspace:${workspaceId}:wheel`,
  signRealtimeSubscribeToken: (_secret: string, payload: unknown) => {
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encodedPayload}.signature`;
  },
  publishWorkspaceLotRealtimeEvent: publishWorkspaceLotRealtimeEventMock,
  publishWorkspaceLotRealtimeEventBestEffort: vi.fn((config: unknown, args: unknown) => {
    void publishWorkspaceLotRealtimeEventMock(config, args).catch(() => false);
  })
}));

vi.mock("../lib/auth", async () => {
  const { HttpError } = await import("../lib/auth/errors");
  return {
    HttpError,
    consumeAuthResponseHeaders: vi.fn(() => ({})),
    resolveUserId: resolveUserIdMock
  };
});

import {
  allSalesList,
  lotLivePricingGet,
  lotLivePricingSave,
  lotSalesMetaGet,
  workspaceRealtimeTokenGet,
  lotRealtimeTokenGet,
  lotSalesDelete,
  lotSalesList,
  lotSalesUpsert
} from "./salesLive";

function createConfig() {
  return createApiConfig();
}

function createRequest(
  method: string,
  body?: unknown,
  params: Record<string, string> = {},
  query = ""
) {
  return createHttpRequest({
    method,
    body,
    params,
    query,
    headers: {
      authorization: "Bearer user-a"
    }
  });
}

function createContext() {
  return createInvocationContext();
}

beforeEach(() => {
  vi.resetAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  listSalesForLotMock.mockResolvedValue([]);
  listSalesForScopeMock.mockResolvedValue([]);
  getLotSalesSyncMetaMock.mockResolvedValue({
    activeCount: 0,
    latestUpdatedAt: null
  });
  deleteSaleDocumentMock.mockResolvedValue({
    saleId: "1"
  });
  getLotLivePricingMock.mockResolvedValue(null);
});

test("lotSalesList returns normalized sales for the resolved scope", async () => {
  listSalesForLotMock.mockResolvedValue([
    {
      sale: {
        id: 11,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 10,
        date: "2026-03-17"
      },
      version: 2,
      updatedAt: "2026-03-17T00:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "sale:1"
    }
  ]);

  const response = await lotSalesList(
    createRequest("GET", undefined, { lotId: "10" }, "workspaceId=team-42") as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(listSalesForLotMock.mock.calls[0]?.[1], "ws:team-42");
  assert.equal((response.jsonBody as { sales: Array<{ version: number }> }).sales[0]?.version, 2);
});

test("allSalesList returns grouped sales for the resolved scope and preserves requested empty lots", async () => {
  listSalesForScopeMock.mockResolvedValue([
    {
      lotId: "10",
      saleId: "sale-1",
      sale: {
        id: 11,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 10,
        date: "2026-03-17"
      },
      version: 2,
      updatedAt: "2026-03-17T00:00:00.000Z",
      updatedBy: "user-a",
      mutationId: "sale:1"
    }
  ]);

  const response = await allSalesList(
    createRequest("GET", undefined, {}, "workspaceId=team-42&lotIds=10,11") as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(listSalesForScopeMock.mock.calls[0]?.[1], "ws:team-42");
  assert.deepEqual(listSalesForScopeMock.mock.calls[0]?.[2], ["10", "11"]);
  assert.deepEqual(response.jsonBody, {
    salesByLot: {
      "10": [
        {
          id: 11,
          type: "pack",
          quantity: 1,
          packsCount: 1,
          price: 10,
          date: "2026-03-17",
          version: 2,
          updatedAt: "2026-03-17T00:00:00.000Z",
          updatedBy: "user-a",
          mutationId: "sale:1"
        }
      ],
      "11": []
    }
  });
});

test("lotSalesMetaGet returns the lot sales freshness metadata for the resolved scope", async () => {
  getLotSalesSyncMetaMock.mockResolvedValue({
    activeCount: 3,
    latestUpdatedAt: "2026-03-17T00:00:00.000Z"
  });

  const response = await lotSalesMetaGet(
    createRequest("GET", undefined, { lotId: "10" }, "workspaceId=team-42") as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(getLotSalesSyncMetaMock.mock.calls[0]?.[1], "ws:team-42");
  assert.deepEqual(response.jsonBody, {
    lotId: "10",
    salesMeta: {
      activeCount: 3,
      latestUpdatedAt: "2026-03-17T00:00:00.000Z"
    }
  });
});

test("lotSalesUpsert writes sale docs with baseVersion and mutationId", async () => {
  publishWorkspaceLotRealtimeEventMock.mockResolvedValue(true);
  upsertSaleDocumentMock.mockResolvedValue({
    sale: {
      id: 11,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      date: "2026-03-17"
    },
    version: 3,
    updatedAt: "2026-03-17T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:save"
  });

  const response = await lotSalesUpsert(
    createRequest("POST", {
      sale: {
        id: 11,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 10,
        date: "2026-03-17",
        version: 1
      },
      workspaceId: "team-42",
      baseVersion: 2,
      mutationId: "sale:save"
    }, { lotId: "10" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.scopeKey, "ws:team-42");
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.baseVersion, 2);
  assert.equal(upsertSaleDocumentMock.mock.calls[0]?.[1]?.mutationId, "sale:save");
  assert.equal((response.jsonBody as { sale: { version: number } }).sale.version, 3);
});

test("lotSalesUpsert rejects negative sale money before repository writes", async () => {
  const response = await lotSalesUpsert(
    createRequest("POST", {
      sale: {
        id: 11,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: -10,
        buyerShipping: 0,
        date: "2026-03-17"
      },
      baseVersion: 2,
      mutationId: "sale:save"
    }, { lotId: "10" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(upsertSaleDocumentMock.mock.calls.length, 0);
  assert.match(String((response.jsonBody as { error?: string }).error), /sale\.price/);
});

test("lotSalesUpsert returns before realtime publish settles", async () => {
  let resolvePublish: (value: boolean) => void = () => {
    throw new Error("Publish resolver was not initialized.");
  };
  publishWorkspaceLotRealtimeEventMock.mockReturnValue(new Promise<boolean>((resolve) => {
    resolvePublish = resolve;
  }));
  upsertSaleDocumentMock.mockResolvedValue({
    sale: {
      id: 11,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      date: "2026-03-17"
    },
    version: 3,
    updatedAt: "2026-03-17T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:save"
  });

  const response = await lotSalesUpsert(
    createRequest("POST", {
      sale: {
        id: 11,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 10,
        date: "2026-03-17"
      },
      workspaceId: "team-42",
      baseVersion: 2,
      mutationId: "sale:save"
    }, { lotId: "10" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(publishWorkspaceLotRealtimeEventMock.mock.calls.length, 1);
  resolvePublish(true);
});

test("lotSalesDelete removes a sale for the resolved scope", async () => {
  publishWorkspaceLotRealtimeEventMock.mockResolvedValue(true);
  const response = await lotSalesDelete(
    createRequest("DELETE", {
      workspaceId: "team-42",
      baseVersion: 5,
      mutationId: "sale:delete"
    }, { lotId: "10", saleId: "11" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(deleteSaleDocumentMock.mock.calls[0]?.[1]?.scopeKey, "ws:team-42");
  assert.equal(deleteSaleDocumentMock.mock.calls[0]?.[1]?.baseVersion, 5);
});

test("lotLivePricingGet returns null when no live pricing doc exists", async () => {
  const response = await lotLivePricingGet(
    createRequest("GET", undefined, { lotId: "10" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { livePricing: null }).livePricing, null);
});

test("lotLivePricingSave persists the live pricing entity", async () => {
  publishWorkspaceLotRealtimeEventMock.mockResolvedValue(true);
  upsertLotLivePricingMock.mockResolvedValue({
    livePackPrice: 9,
    liveBoxPriceSell: 99,
    liveSpotPrice: 12,
    version: 2,
    updatedAt: "2026-03-17T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "live:save"
  });

  const response = await lotLivePricingSave(
    createRequest("POST", {
      livePackPrice: 9,
      liveBoxPriceSell: 99,
      liveSpotPrice: 12,
      baseVersion: 1,
      mutationId: "live:save"
    }, { lotId: "10" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertLotLivePricingMock.mock.calls[0]?.[1]?.lotId, "10");
  assert.equal(upsertLotLivePricingMock.mock.calls[0]?.[1]?.baseVersion, 1);
  assert.equal((response.jsonBody as { livePricing: { version: number } }).livePricing.version, 2);
});

test("lotLivePricingSave rejects negative live pricing before repository writes", async () => {
  const response = await lotLivePricingSave(
    createRequest("POST", {
      livePackPrice: -1,
      liveBoxPriceSell: 99,
      liveSpotPrice: 12,
      baseVersion: 1,
      mutationId: "live:save"
    }, { lotId: "10" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(upsertLotLivePricingMock.mock.calls.length, 0);
  assert.match(String((response.jsonBody as { error?: string }).error), /livePackPrice/);
});

test("lotLivePricingSave emits route telemetry for stale live pricing conflicts", async () => {
  upsertLotLivePricingMock.mockRejectedValue(new EntityVersionConflictErrorMock("Live pricing changed since it was last loaded."));
  const context = createContext();

  const response = await lotLivePricingSave(
    createRequest("POST", {
      workspaceId: "team-42",
      livePackPrice: 9,
      liveBoxPriceSell: 99,
      liveSpotPrice: 12,
      baseVersion: 1,
      mutationId: "live:save"
    }, { lotId: "10" }) as never,
    context as never
  );

  assert.equal(response.status, 409);
  assert.equal(context.warn.mock.calls.length, 1);
  assert.equal(context.warn.mock.calls[0]?.[0], "api.telemetry");
  assert.equal(context.warn.mock.calls[0]?.[1]?.route, "lot_live_pricing_save");
  assert.equal(context.warn.mock.calls[0]?.[1]?.workspace_scope, "workspace");
  assert.equal(context.warn.mock.calls[0]?.[1]?.outcome, "http_409");
});

test("lotRealtimeTokenGet returns a signed room token for workspace lots", async () => {
  getConfigMock.mockReturnValue({
    ...createConfig(),
    realtimeTokenSecret: "token-secret"
  });

  const response = await lotRealtimeTokenGet(
    createRequest("GET", undefined, { lotId: "1773766061603" }, "workspaceId=ws_dcb4d6f021637411") as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  const body = response.jsonBody as {
    room: string;
    rooms: string[];
    token: string;
    expiresAt: number;
  };
  assert.equal(body.room, "workspace:ws_dcb4d6f021637411:lot:1773766061603");
  assert.deepEqual(body.rooms, [
    "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    "workspace:ws_dcb4d6f021637411:presence",
    "workspace:ws_dcb4d6f021637411:wheel"
  ]);
  assert.match(body.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(typeof body.expiresAt, "number");

  const [encodedPayload] = body.token.split(".");
  const decodedPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    rooms: string[];
    userId?: string;
    exp?: number;
  };
  assert.deepEqual(decodedPayload.rooms, body.rooms);
  assert.equal(decodedPayload.userId, "user-a");
  assert.equal(decodedPayload.exp, body.expiresAt);
});

test("workspaceRealtimeTokenGet returns a signed room token for workspace presence", async () => {
  getConfigMock.mockReturnValue({
    ...createConfig(),
    realtimeTokenSecret: "token-secret"
  });

  const response = await workspaceRealtimeTokenGet(
    createRequest("GET", undefined, { workspaceId: "ws_dcb4d6f021637411" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  const body = response.jsonBody as {
    room: string;
    rooms: string[];
    token: string;
    expiresAt: number;
  };
  assert.equal(body.room, "workspace:ws_dcb4d6f021637411:presence");
  assert.deepEqual(body.rooms, [
    "workspace:ws_dcb4d6f021637411:presence"
  ]);
  assert.match(body.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(typeof body.expiresAt, "number");

  const [encodedPayload] = body.token.split(".");
  const decodedPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    rooms: string[];
    userId?: string;
    exp?: number;
  };
  assert.deepEqual(decodedPayload.rooms, body.rooms);
  assert.equal(decodedPayload.userId, "user-a");
  assert.equal(decodedPayload.exp, body.expiresAt);
});
