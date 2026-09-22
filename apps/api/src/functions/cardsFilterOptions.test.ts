import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig, createHttpRequest, createInvocationContext } from "../test-support/function-test-helpers";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const { getConfigMock, listCardCatalogFilterOptionsMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  listCardCatalogFilterOptionsMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/cardCatalogRepository", () => ({
  listCardCatalogFilterOptions: listCardCatalogFilterOptionsMock
}));

import {
  cardsFilterOptions
} from "../features/cards/filterOptionsHandler";
import {
  createCardCatalogFilterOptionsCache
} from "../features/cards/filterOptionsHandler";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig({ cardCatalogContainerId: "card_catalog" }));
  listCardCatalogFilterOptionsMock.mockResolvedValue([
    { value: "sv8", label: "Surging Sparks" }
  ]);
});

test("cardsFilterOptions validates game and returns normalized options", async () => {
  const response = await cardsFilterOptions(
    createHttpRequest({ method: "GET", query: "game=Pokemon" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(listCardCatalogFilterOptionsMock.mock.calls[0]?.[1], "pokemon");
  assert.deepEqual(response.jsonBody, {
    ok: true,
    game: "pokemon",
    count: 1,
    items: [{ value: "sv8", label: "Surging Sparks" }]
  });
});

test("cardsFilterOptions rejects a missing game", async () => {
  const response = await cardsFilterOptions(
    createHttpRequest({ method: "GET" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(listCardCatalogFilterOptionsMock.mock.calls.length, 0);
});

test("catalog filter options cache reuses a warm lookup for the same game", async () => {
  const load = vi.fn().mockResolvedValue([{ value: "sv8", label: "Surging Sparks" }]);
  const cache = createCardCatalogFilterOptionsCache(load, () => 0);

  await cache.get("pokemon");
  await cache.get("pokemon");

  assert.equal(load.mock.calls.length, 1);
});

test("catalog filter options cache reloads at the 15-minute expiry", async () => {
  const load = vi.fn().mockResolvedValue([{ value: "sv8", label: "Surging Sparks" }]);
  let now = 0;
  const cache = createCardCatalogFilterOptionsCache(load, () => now);

  await cache.get("pokemon");
  now = 15 * 60 * 1000;
  await cache.get("pokemon");

  assert.equal(load.mock.calls.length, 2);
});

test("catalog filter options cache keeps games isolated", async () => {
  const load = vi.fn().mockResolvedValue([{ value: "sv8", label: "Surging Sparks" }]);
  const cache = createCardCatalogFilterOptionsCache(load, () => 0);

  await cache.get("pokemon");
  await cache.get("ua");

  assert.deepEqual(load.mock.calls, [["pokemon"], ["ua"]]);
});

test("catalog filter options cache retries a failed load", async () => {
  const load = vi.fn()
    .mockRejectedValueOnce(new Error("temporary catalog failure"))
    .mockResolvedValueOnce([{ value: "sv8", label: "Surging Sparks" }]);
  const cache = createCardCatalogFilterOptionsCache(load, () => 0);

  await assert.rejects(cache.get("pokemon"), /temporary catalog failure/);
  await cache.get("pokemon");

  assert.equal(load.mock.calls.length, 2);
});

test("catalog filter options cache shares concurrent misses for the same game", async () => {
  let resolveLoad: ((value: Array<{ value: string; label: string }>) => void) | undefined;
  const load = vi.fn(() => new Promise<Array<{ value: string; label: string }>>((resolve) => {
    resolveLoad = resolve;
  }));
  const cache = createCardCatalogFilterOptionsCache(load, () => 0);

  const first = cache.get("pokemon");
  const second = cache.get("pokemon");
  resolveLoad?.([{ value: "sv8", label: "Surging Sparks" }]);

  assert.deepEqual(await Promise.all([first, second]), [
    [{ value: "sv8", label: "Surging Sparks" }],
    [{ value: "sv8", label: "Surging Sparks" }]
  ]);
  assert.equal(load.mock.calls.length, 1);
});
