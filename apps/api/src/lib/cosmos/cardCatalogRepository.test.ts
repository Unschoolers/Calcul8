import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { getContainersMock, queryMock, fetchAllMock } = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  queryMock: vi.fn(),
  fetchAllMock: vi.fn()
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  withCosmosRetry: async <T>(operation: () => Promise<T>) => await operation()
}));

import { listCardCatalogFilterOptions, searchCardCatalog } from "./cardCatalogRepository";

const config = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  fetchAllMock.mockResolvedValue({ resources: [] });
  queryMock.mockReturnValue({ fetchAll: fetchAllMock });
  getContainersMock.mockReturnValue({
    cardCatalog: {
      items: { query: queryMock }
    }
  });
});

test("searchCardCatalog constrains Pokemon searches by exact setId", async () => {
  await searchCardCatalog(config, {
    game: "pokemon",
    query: "pikachu sr**",
    limit: 10,
    filter: "sv8"
  });

  const querySpec = queryMock.mock.calls[0]?.[0];
  assert.match(querySpec.query, /AND c\.setId = @filter/);
  assert.deepEqual(querySpec.parameters.at(-1), { name: "@filter", value: "sv8" });
});

test("searchCardCatalog constrains Union Arena searches by exact series", async () => {
  await searchCardCatalog(config, {
    game: "ua",
    query: "asta sr**",
    limit: 10,
    filter: "black-clover"
  });

  const querySpec = queryMock.mock.calls[0]?.[0];
  assert.match(querySpec.query, /AND c\.series = @filter/);
  assert.deepEqual(querySpec.parameters.at(-1), { name: "@filter", value: "black-clover" });
});

test("searchCardCatalog leaves the existing query contract unchanged without a filter", async () => {
  await searchCardCatalog(config, {
    game: "ua",
    query: "asta sr**",
    limit: 10
  });

  const querySpec = queryMock.mock.calls[0]?.[0];
  assert.doesNotMatch(querySpec.query, /@filter|c\.(?:setId|series) =/);
  assert.deepEqual(querySpec.parameters, [
    { name: "@pk", value: "ua" },
    { name: "@game", value: "ua" },
    { name: "@token0", value: "asta" },
    { name: "@token1", value: "sr★★" }
  ]);
});

test("listCardCatalogFilterOptions normalizes, de-duplicates, and sorts catalog entries", async () => {
  fetchAllMock.mockResolvedValue({
    resources: [
      { setId: "sv8", seriesName: "Surging Sparks" },
      { setId: "sv1", seriesName: "Scarlet & Violet" },
      { setId: "sv8", seriesName: "Duplicate" },
      { setId: "", seriesName: "Missing value" },
      { setId: "sv2" }
    ]
  });

  const options = await listCardCatalogFilterOptions(config, "pokemon");

  assert.deepEqual(options, [
    { value: "sv1", label: "Scarlet & Violet" },
    { value: "sv8", label: "Surging Sparks" },
    { value: "sv2", label: "sv2" }
  ]);
  const querySpec = queryMock.mock.calls[0]?.[0];
  assert.match(querySpec.query, /c\.setId/);
  assert.equal(queryMock.mock.calls[0]?.[1].partitionKey, "pokemon");
});

test("listCardCatalogFilterOptions uses Union Arena series values with seriesName fallbacks", async () => {
  fetchAllMock.mockResolvedValue({
    resources: [
      { series: "blc", seriesName: "Black Clover" },
      { series: "htr" },
      { series: "blc", seriesName: "Duplicate" },
      { series: "", seriesName: "Invalid" }
    ]
  });

  const options = await listCardCatalogFilterOptions(config, "ua");

  assert.deepEqual(options, [
    { value: "blc", label: "Black Clover" },
    { value: "htr", label: "htr" }
  ]);
  const querySpec = queryMock.mock.calls[0]?.[0];
  assert.match(querySpec.query, /c\.series/);
  assert.equal(queryMock.mock.calls[0]?.[1].partitionKey, "ua");
});
