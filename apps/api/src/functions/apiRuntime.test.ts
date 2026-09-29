import assert from "node:assert/strict";
import { test, vi } from "vitest";

const { httpMock, timerMock } = vi.hoisted(() => ({
  httpMock: vi.fn(),
  timerMock: vi.fn()
}));

vi.mock("@azure/functions", () => ({
  app: {
    http: httpMock,
    timer: timerMock
  }
}));

test("API runtime entrypoint registers the card filter options route", async () => {
  await import("../index");

  assert.equal(httpMock.mock.calls.some(([, definition]) => (
    (definition as { route?: string }).route === "cards/filter-options"
  )), true);
});
