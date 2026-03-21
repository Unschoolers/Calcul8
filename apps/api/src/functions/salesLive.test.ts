import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  hasWorkspaceMembershipMock,
  listSalesForLotMock,
  upsertSaleDocumentMock,
  deleteSaleDocumentMock,
  getLotLivePricingMock,
  upsertLotLivePricingMock,
  EntityVersionConflictErrorMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  listSalesForLotMock: vi.fn(),
  upsertSaleDocumentMock: vi.fn(),
  deleteSaleDocumentMock: vi.fn(),
  getLotLivePricingMock: vi.fn(),
  upsertLotLivePricingMock: vi.fn(),
  EntityVersionConflictErrorMock: class EntityVersionConflictError extends Error {}
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/salesRepository", () => ({
  EntityVersionConflictError: EntityVersionConflictErrorMock,
  listSalesForLot: listSalesForLotMock,
  upsertSaleDocument: upsertSaleDocumentMock,
  deleteSaleDocument: deleteSaleDocumentMock,
  getLotLivePricing: getLotLivePricingMock,
  upsertLotLivePricing: upsertLotLivePricingMock
}));

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

import {
  lotLivePricingGet,
  lotLivePricingSave,
  lotRealtimeTokenGet,
  lotSalesDelete,
  lotSalesList,
  lotSalesUpsert
} from "./salesLive";

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

function createRequest(
  method: string,
  body?: unknown,
  params: Record<string, string> = {},
  query = ""
) {
  return {
    method,
    params,
    url: `https://api.example/${query ? `?${query}` : ""}`,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "authorization") return "Bearer user-a";
        return null;
      }
    },
    json: body === undefined ? undefined : async () => body
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.resetAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  listSalesForLotMock.mockResolvedValue([]);
  deleteSaleDocumentMock.mockResolvedValue({
    saleId: "1"
  });
  getLotLivePricingMock.mockResolvedValue(null);
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      sub: "user-a"
    })
  })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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

test("lotSalesUpsert writes sale docs with baseVersion and mutationId", async () => {
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

test("lotSalesDelete removes a sale for the resolved scope", async () => {
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
