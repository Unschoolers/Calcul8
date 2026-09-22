import assert from "node:assert/strict";
import { test, vi } from "vitest";

const { httpMock } = vi.hoisted(() => ({
  httpMock: vi.fn()
}));

vi.mock("@azure/functions", () => ({
  app: {
    http: httpMock
  }
}));

test("API runtime entrypoint registers the card filter options route", async () => {
  await import("../index");

  assert.equal(httpMock.mock.calls.some(([, definition]) => (
    (definition as { route?: string }).route === "cards/filter-options"
  )), true);
});
