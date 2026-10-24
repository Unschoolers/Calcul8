import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const { fetchAuthenticatedApiResponseMock, resolveApiBaseUrlMock, hasAuthSignalMock } = vi.hoisted(() => ({
  fetchAuthenticatedApiResponseMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn(() => "https://api.example.test"),
  hasAuthSignalMock: vi.fn(() => true)
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchAuthenticatedApiResponse: fetchAuthenticatedApiResponseMock,
  handleExpiredAuth: vi.fn(),
  isApiNetworkFailure: (error: unknown) => error instanceof TypeError,
  isApiRequestAborted: (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/auth/index.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../src/app-core/auth/index.ts")>(),
  getStoredGoogleIdToken: () => "",
  hasAuthSignal: hasAuthSignalMock
}));

import { fetchWorkspaceJson } from "../src/app-core/methods/ui/workspace/workspace-api.ts";

afterEach(() => {
  vi.clearAllMocks();
  hasAuthSignalMock.mockReturnValue(true);
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
});

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

test("workspace body cancellation is handled without returning stale success or notifying", async () => {
  const app = { notify: vi.fn() };
  const response = new Response("{}");
  Object.defineProperty(response, "json", { value: async () => { throw new DOMException("Aborted", "AbortError"); } });
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(response);

  const result = await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Failed to load workspaces.");

  assert.deepEqual(result, { ok: false, handled: true });
  assert.equal(app.notify.mock.calls.length, 0);
});

test("workspace HTTP boundaries localize controlled fallbacks and preserve arbitrary API errors", async () => {
  const app = { preferredLanguage: "fr-CA", notify: vi.fn() };
  resolveApiBaseUrlMock.mockReturnValueOnce("");

  await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Impossible de charger les espaces partagés.");
  assert.deepEqual(app.notify.mock.calls.at(-1), ["Les fonctions d’espace partagé ne sont pas disponibles tant que l’URL de l’API n’est pas configurée.", "warning"]);

  hasAuthSignalMock.mockReturnValueOnce(false);
  await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Impossible de charger les espaces partagés.");
  assert.deepEqual(app.notify.mock.calls.at(-1), ["Connectez-vous d’abord avec Google.", "warning"]);

  fetchAuthenticatedApiResponseMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Impossible de charger les espaces partagés.");
  assert.deepEqual(app.notify.mock.calls.at(-1), ["Vous êtes hors ligne. Les données de l’espace seront actualisées au retour de la connexion.", "warning"]);

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Détail technique du serveur" }), { status: 503 }));
  await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Impossible de charger les espaces partagés.");
  assert.deepEqual(app.notify.mock.calls.at(-1), ["Détail technique du serveur", "error"]);
});

test("workspace HTTP boundaries use the existing English fallback when no language is configured", async () => {
  const app = { notify: vi.fn() };
  fetchAuthenticatedApiResponseMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

  await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Failed to load workspaces.");

  assert.deepEqual(app.notify.mock.calls.at(-1), ["You're offline. Workspace data will refresh when the connection returns.", "warning"]);
});

test("workspace HTTP boundaries localize the controlled expired-session response", async () => {
  const app = { preferredLanguage: "fr-CA", notify: vi.fn() };
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));

  const result = await fetchWorkspaceJson(app as never, "/workspaces/me", { method: "GET" }, "Impossible de charger les espaces partagés.");

  assert.deepEqual(result, { ok: false, handled: true });
  assert.deepEqual(app.notify.mock.calls.at(-1), ["Votre session a expiré. Veuillez vous reconnecter.", "warning"]);
});
