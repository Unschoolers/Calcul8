import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig, createHttpRequest, createInvocationContext } from "../test-support/function-test-helpers";

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

vi.mock("../lib/cosmos/cardCatalogRepository", () => ({
  searchCardCatalog: searchCardCatalogMock
}));

import { cardsSearch } from "./cardsSearch";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig({ cardCatalogContainerId: "card_catalog" }));
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
  const request = createHttpRequest({ method: "GET", query: "game=ua&q=asgu&limit=10" });
  const context = createInvocationContext();

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

test("cardsSearch defaults limit to 25 when omitted", async () => {
  const request = createHttpRequest({ method: "GET", query: "game=ua&q=asgu" });
  const context = createInvocationContext();

  const response = await cardsSearch(request as never, context as never);

  assert.equal(response.status, 200);
  assert.deepEqual(searchCardCatalogMock.mock.calls[0]?.[1], {
    game: "ua",
    query: "asgu",
    limit: 25
  });
});

test("cardsSearch validates missing game", async () => {
  const request = createHttpRequest({ method: "GET", query: "q=asgu&limit=10" });
  const context = createInvocationContext();

  const response = await cardsSearch(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(searchCardCatalogMock.mock.calls.length, 0);
});

test("cardsSearch validates short query", async () => {
  const request = createHttpRequest({ method: "GET", query: "game=ua&q=a&limit=10" });
  const context = createInvocationContext();

  const response = await cardsSearch(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(searchCardCatalogMock.mock.calls.length, 0);
});

test("cardsSearch validates limit range", async () => {
  const request = createHttpRequest({ method: "GET", query: "game=ua&q=asgu&limit=500" });
  const context = createInvocationContext();

  const response = await cardsSearch(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(searchCardCatalogMock.mock.calls.length, 0);
});
