import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const { getConfigMock, searchCardCatalogMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  searchCardCatalogMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos", () => ({
  searchCardCatalog: searchCardCatalogMock
}));

import { cardsSearch } from "./cardsSearch";

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
    migrationRunsContainerId: "migration_runs",
    cardCatalogContainerId: "card_catalog"
  };
}

function createRequest(url: string, method = "GET") {
  return {
    method,
    url,
    headers: {
      get() {
        return null;
      }
    },
    query: new URL(url).searchParams
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  searchCardCatalogMock.mockResolvedValue([
    {
      id: "ua:UE01BT_BLC-1-001",
      game: "ua",
      cardNo: "UE01BT/BLC-1-001",
      name: "Asguiaro Ebern",
      series: "blc"
    }
  ]);
});

test("cardsSearch returns results for valid query", async () => {
  const request = createRequest("https://example.test/api/cards/search?game=ua&q=asgu&limit=10");
  const context = createContext();

  const response = await cardsSearch(request as never, context as never);

  assert.equal(response.status, 200);
  assert.equal(searchCardCatalogMock.mock.calls.length, 1);
  assert.deepEqual(searchCardCatalogMock.mock.calls[0]?.[1], {
    game: "ua",
    query: "asgu",
    limit: 10
  });
  assert.equal((response.jsonBody as { count: number }).count, 1);
});

test("cardsSearch validates missing game", async () => {
  const request = createRequest("https://example.test/api/cards/search?q=asgu&limit=10");
  const context = createContext();

  const response = await cardsSearch(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(searchCardCatalogMock.mock.calls.length, 0);
});

test("cardsSearch validates short query", async () => {
  const request = createRequest("https://example.test/api/cards/search?game=ua&q=a&limit=10");
  const context = createContext();

  const response = await cardsSearch(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(searchCardCatalogMock.mock.calls.length, 0);
});

test("cardsSearch validates limit range", async () => {
  const request = createRequest("https://example.test/api/cards/search?game=ua&q=asgu&limit=500");
  const context = createContext();

  const response = await cardsSearch(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(searchCardCatalogMock.mock.calls.length, 0);
});

