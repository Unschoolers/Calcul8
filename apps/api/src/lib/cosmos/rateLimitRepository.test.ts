import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { createMock, getContainersMock, itemMock, patchMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getContainersMock: vi.fn(),
  itemMock: vi.fn(),
  patchMock: vi.fn()
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isConflictError: (error: unknown) => (error as { statusCode?: number })?.statusCode === 409,
  isNotFoundError: (error: unknown) => (error as { statusCode?: number })?.statusCode === 404,
  withCosmosRetry: async <T>(operation: () => Promise<T>) => await operation()
}));

import { incrementRateLimitCounter } from "./rateLimitRepository";

const config = {} as never;
const input = {
  clientKey: "cards_search:198.51.100.12",
  windowStartMs: 1_000,
  windowSeconds: 10
};

beforeEach(() => {
  vi.clearAllMocks();
  itemMock.mockReturnValue({ patch: patchMock });
  getContainersMock.mockReturnValue({
    sessions: {
      item: itemMock,
      items: { create: createMock }
    }
  });
});

test("increments an existing counter without first attempting a duplicate create", async () => {
  createMock.mockRejectedValueOnce({ statusCode: 409 });
  patchMock.mockResolvedValue({ resource: { count: 4 } });

  const count = await incrementRateLimitCounter(config, input);

  assert.equal(count, 4);
  assert.deepEqual(itemMock.mock.calls[0], [
    "rate_limit:894d74f371dc31764df4c536a681322f12dab251c88732da62884fee5c9c0dff:10:1000",
    "rate_limit:894d74f371dc31764df4c536a681322f12dab251c88732da62884fee5c9c0dff:10:1000"
  ]);
  assert.equal(patchMock.mock.calls.length, 1);
  assert.equal(createMock.mock.calls.length, 0);
});

test("retries the atomic patch when a concurrent request creates a missing counter", async () => {
  patchMock
    .mockRejectedValueOnce({ statusCode: 404 })
    .mockResolvedValueOnce({ resource: { count: 2 } });
  createMock
    .mockRejectedValueOnce({ statusCode: 409 })
    .mockRejectedValueOnce({ statusCode: 409 });

  const count = await incrementRateLimitCounter(config, input);

  assert.equal(count, 2);
  assert.equal(patchMock.mock.calls.length, 2);
  assert.equal(createMock.mock.calls.length, 1);
});
