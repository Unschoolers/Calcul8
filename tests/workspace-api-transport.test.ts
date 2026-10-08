import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const { fetchAuthenticatedApiResponseMock, resolveApiBaseUrlMock } = vi.hoisted(() => ({
  fetchAuthenticatedApiResponseMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn(() => "https://api.example.test")
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchAuthenticatedApiResponse: fetchAuthenticatedApiResponseMock,
  handleExpiredAuth: vi.fn(),
  isApiRequestAborted: (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/auth/index.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../src/app-core/auth/index.ts")>(),
  getStoredGoogleIdToken: () => "",
  hasAuthSignal: () => true
}));

import { fetchWorkspaceJson } from "../src/app-core/methods/ui/workspace/workspace-api.ts";

afterEach(() => vi.clearAllMocks());

test("workspace requests use the shared authenticated transport and preserve caller cancellation", async () => {
  const controller = new AbortController();
  const app = { notify: vi.fn() };
  fetchAuthenticatedApiResponseMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

  const result = await fetchWorkspaceJson(
    app as never,
    "/workspaces/me",
    { method: "GET", signal: controller.signal },
    "Failed to load workspaces."
  );

  assert.deepEqual(result, { ok: false, handled: true });
  assert.equal(app.notify.mock.calls.length, 0);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[1], "/workspaces/me");
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[2]?.signal, controller.signal);
  assert.deepEqual(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[3], { expireAuthOn401: false, retryUnsafeMethods: undefined });
});

test("workspace creation marks its stable idempotency-key request retry-safe", async () => {
  const app = { notify: vi.fn() };
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ workspace: { workspaceId: "ws_1" } }), { status: 201 }));

  await fetchWorkspaceJson(
    app as never,
    "/workspaces",
    { method: "POST", body: JSON.stringify({ idempotencyKey: "workspace-create-1" }) },
    "Failed to create workspace.",
    { retryUnsafeMethods: true }
  );

  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[2]?.body, JSON.stringify({ idempotencyKey: "workspace-create-1" }));
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[3]?.retryUnsafeMethods, true);
});
