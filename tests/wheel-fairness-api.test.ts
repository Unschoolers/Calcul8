import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchWithRetry: fetchWithRetryMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import {
    WheelFairnessApiError,
    createWheelFairnessCommit,
    revealWheelFairnessResult
} from "../src/app-core/methods/wheel-fairness-api.ts";

const layoutHash = "c".repeat(64);

function createResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
});

test("createWheelFairnessCommit returns null when no API base URL is configured", async () => {
  resolveApiBaseUrlMock.mockReturnValue("");

  const result = await createWheelFairnessCommit(12, layoutHash);

  assert.equal(result, null);
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("createWheelFairnessCommit normalizes the public commit response", async () => {
  fetchWithRetryMock.mockResolvedValue(createResponse({
    commitToken: "v1.token",
    serverSeedHash: "a".repeat(64),
    layoutHash,
    slotCount: 12,
    algorithm: "whatfees-wheel-v1",
    committedAt: 123,
    expiresAt: 456
  }));

  const result = await createWheelFairnessCommit(12, layoutHash);

  assert.deepEqual(result, {
    commitToken: "v1.token",
    serverSeedHash: "a".repeat(64),
    layoutHash,
    slotCount: 12,
    algorithm: "whatfees-wheel-v1",
    committedAt: 123,
    expiresAt: 456
  });
  assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://api.example.test/wheel/fairness/commit");
  const requestInit = fetchWithRetryMock.mock.calls[0]?.[1] as { body?: string };
  assert.deepEqual(JSON.parse(String(requestInit.body || "{}")), {
    slotCount: 12,
    layoutHash
  });
});

test("revealWheelFairnessResult normalizes server proof details", async () => {
  fetchWithRetryMock.mockResolvedValue(createResponse({
    serverSeedHash: "b".repeat(64),
    serverSeed: "server-seed",
    clientSeed: "client-seed",
    layoutHash,
    resultIndex: 4,
    slotCount: 12,
    algorithm: "whatfees-wheel-v1",
    committedAt: 123,
    revealedAt: 456,
    verificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=server-seed&clientSeed=client-seed&slotCount=12"
  }));

  const result = await revealWheelFairnessResult("v1.token", "client-seed");

  assert.equal(result.resultIndex, 4);
  assert.equal(result.clientSeed, "client-seed");
  assert.equal(result.layoutHash, layoutHash);
  assert.match(result.verificationUrl, /wheel\/fairness\/verify/);
  const requestInit = fetchWithRetryMock.mock.calls[0]?.[1] as { body?: string };
  assert.deepEqual(JSON.parse(String(requestInit.body || "{}")), {
    commitToken: "v1.token",
    clientSeed: "client-seed"
  });
});

test("revealWheelFairnessResult throws a typed API error for invalid responses", async () => {
  fetchWithRetryMock.mockResolvedValue(createResponse({
    resultIndex: 2
  }));

  await assert.rejects(
    () => revealWheelFairnessResult("v1.token", "client-seed"),
    (error: unknown) => error instanceof WheelFairnessApiError && error.status === 500
  );
});
