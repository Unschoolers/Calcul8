import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../../test-support/function-test-helpers";

const { deleteWhatnotConnectionMock } = vi.hoisted(() => ({
  deleteWhatnotConnectionMock: vi.fn()
}));

vi.mock("../../lib/cosmos/whatnotRepository", () => ({
  deleteWhatnotConnection: deleteWhatnotConnectionMock
}));

import { eraseAccountData } from "./accountErasureService";

beforeEach(() => {
  vi.clearAllMocks();
  deleteWhatnotConnectionMock.mockResolvedValue(undefined);
});

test("eraseAccountData deletes the personal Whatnot connection for the deleted account", async () => {
  const config = createApiConfig();

  await eraseAccountData(config, "user-1");

  assert.deepEqual(deleteWhatnotConnectionMock.mock.calls[0], [config, "user-1"]);
});

test("eraseAccountData preserves workspace-owned Whatnot connections", async () => {
  const config = createApiConfig();

  await eraseAccountData(config, "user-1");

  assert.equal(deleteWhatnotConnectionMock.mock.calls.length, 1);
  assert.notEqual(deleteWhatnotConnectionMock.mock.calls[0]?.[1], "ws:team-42");
});
