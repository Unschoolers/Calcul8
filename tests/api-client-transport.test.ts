import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { getStoredCsrfToken, setStoredCsrfToken } from "../src/app-core/auth/index.ts";
import { fetchAuthenticatedApiResponse, fetchWithRetry } from "../src/app-core/methods/ui/common/api-client.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("fetchWithRetry does not issue a request for a pre-aborted caller", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);

  await assert.rejects(
    fetchWithRetry("https://api.example.test/data", { signal: controller.signal }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError"
  );
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("fetchWithRetry forwards caller cancellation to fetch and does not retry it", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    controller.abort();
  }));
  vi.stubGlobal("fetch", fetchMock);

  await assert.rejects(
    fetchWithRetry("https://api.example.test/data", { signal: controller.signal }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError"
  );
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("fetchWithRetry enforces its timeout by aborting the in-flight fetch", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);

  const request = fetchWithRetry("https://api.example.test/slow", { method: "GET" }, { timeoutMs: 250, maxAttempts: 1 });
  const rejected = assert.rejects(request, (error: unknown) => error instanceof DOMException && error.name === "TimeoutError");
  await vi.advanceTimersByTimeAsync(250);

  await rejected;
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(fetchMock.mock.calls[0]?.[1]?.signal?.aborted, true);
});

test("fetchWithRetry keeps CSRF headers and stores the rotated session token", async () => {
  const storage = new Map<string, string>([["whatfees_csrf_token_v1", "csrf-old"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok", {
    status: 200,
    headers: { "x-csrf-token": "csrf-next" }
  }));
  vi.stubGlobal("fetch", fetchMock);

  await fetchWithRetry("https://api.example.test/write", { method: "POST", body: "{}" }, { maxAttempts: 1 });

  const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
  assert.equal(requestHeaders.get("x-csrf-token"), "csrf-old");
  assert.equal(getStoredCsrfToken(), "csrf-next");
});

test("fetchWithRetry preserves response metadata while linking the streamed body to caller abort", async () => {
  const controller = new AbortController();
  const response = new Response(new ReadableStream<Uint8Array>({
    start(streamController) {
      streamController.enqueue(new TextEncoder().encode("{"));
    }
  }), { status: 206, statusText: "Partial Content", headers: { "x-result": "kept" } });
  Object.defineProperty(response, "url", { value: "https://api.example.test/resource" });
  Object.defineProperty(response, "redirected", { value: true });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);

  const linked = await fetchWithRetry("https://api.example.test/resource", { signal: controller.signal }, { maxAttempts: 1 });

  assert.equal(linked.status, 206);
  assert.equal(linked.statusText, "Partial Content");
  assert.equal(linked.headers.get("x-result"), "kept");
  assert.equal(linked.url, response.url);
  assert.equal(linked.redirected, true);
  const readBody = linked.json();
  controller.abort();
  await assert.rejects(readBody, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("fetchWithRetry does not retry unsafe writes without an explicit idempotent policy", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);

  const response = await fetchWithRetry("https://api.example.test/write", {
    method: "POST",
    body: "{}"
  }, { maxAttempts: 3, baseDelayMs: 0 });

  assert.equal(response.status, 503);
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("fetchWithRetry retries an unsafe write only when its stable identity policy is explicit", async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("busy", { status: 503 }))
    .mockResolvedValueOnce(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const response = await fetchWithRetry("https://api.example.test/write", {
    method: "POST",
    headers: { "Idempotency-Key": "mutation-1" },
    body: "{}"
  }, { maxAttempts: 2, baseDelayMs: 0, retryUnsafeMethods: true });

  assert.equal(response.status, 200);
  assert.equal(fetchMock.mock.calls.length, 2);
});

test.each([
  ["seconds", "2", 2_000],
  ["HTTP date", "Thu, 01 Jan 1970 00:00:05 GMT", 5_000]
])("fetchWithRetry honors Retry-After as %s and bounds the delay", async (_kind, value, expectedDelay) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("1970-01-01T00:00:00.000Z"));
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "Retry-After": value } }))
    .mockResolvedValueOnce(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const request = fetchWithRetry("https://api.example.test/read", { method: "GET" }, {
    maxAttempts: 2,
    baseDelayMs: 1,
    maxRetryDelayMs: 3_000
  });
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(fetchMock.mock.calls.length, 1);
  await vi.advanceTimersByTimeAsync(Math.min(expectedDelay, 3_000));
  assert.equal((await request).status, 200);
  assert.equal(fetchMock.mock.calls.length, 2);
});

test("fetchWithRetry bounds Retry-After and cancels its delay when the caller aborts", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", {
    status: 503,
    headers: { "Retry-After": "120" }
  }));
  vi.stubGlobal("fetch", fetchMock);

  const request = fetchWithRetry("https://api.example.test/read", {
    method: "GET",
    signal: controller.signal
  }, { maxAttempts: 2, baseDelayMs: 1, maxRetryDelayMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();

  await assert.rejects(request, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("an aborted caller waiting for shared auth refresh does not cancel other callers", async () => {
  const originalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    }
  });
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");

  let finishRefresh: ((response: Response) => void) | undefined;
  let refreshStarted: (() => void) | undefined;
  const refreshStartedPromise = new Promise<void>(resolve => { refreshStarted = resolve; });
  const protectedCalls = new Map<string, number>();
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      refreshStarted?.();
      return await new Promise<Response>(resolve => { finishRefresh = resolve; });
    }
    const path = new URL(url).pathname;
    const count = (protectedCalls.get(path) ?? 0) + 1;
    protectedCalls.set(path, count);
    return new Response("{}", { status: count === 1 ? 401 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  try {
    const firstController = new AbortController();
    const first = fetchAuthenticatedApiResponse({ googleAuthEpoch: 0, hasProAccess: false } as never,
      "/first", { method: "GET", signal: firstController.signal });
    const second = fetchAuthenticatedApiResponse({ googleAuthEpoch: 0, hasProAccess: false } as never,
      "/second", { method: "GET" });
    await refreshStartedPromise;
    firstController.abort();
    finishRefresh?.(new Response(JSON.stringify({ userId: "user-1" }), { status: 200 }));

    await assert.rejects(first, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.equal((await second).status, 200);
    assert.equal(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh")).length, 1);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("an unsafe authenticated request is replayed after a successful 401 refresh", async () => {
  const originalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }
  });
  setStoredCsrfToken("csrf-mutation");
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  let protectedCalls = 0;
  const fetchMock = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith("/auth/refresh")) {
      return new Response(JSON.stringify({ userId: "user-1" }), { status: 200 });
    }
    protectedCalls += 1;
    return new Response(protectedCalls === 1 ? "unauthorized" : "ok", { status: protectedCalls === 1 ? 401 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  try {
    const response = await fetchAuthenticatedApiResponse(
      { googleAuthEpoch: 0, hasProAccess: false } as never,
      "/mutate",
      { method: "POST", headers: new Headers([["x-mutation-tag", "mutation-1"]]), body: JSON.stringify({ mutationId: "mutation-1" }) }
    );
    assert.equal(response.status, 200);
    assert.equal(protectedCalls, 2);
    const protectedRequestCalls = fetchMock.mock.calls.filter(([input]) => !String(input).endsWith("/auth/refresh"));
    assert.equal(protectedRequestCalls[0]?.[1]?.headers instanceof Headers, true);
    for (const [, init] of protectedRequestCalls) {
      assert.equal(new Headers(init?.headers).get("x-mutation-tag"), "mutation-1");
      assert.equal(new Headers(init?.headers).get("x-csrf-token"), "csrf-mutation");
    }
    const protectedBodies = protectedRequestCalls.map(([, init]) => init?.body);
    assert.deepEqual(protectedBodies, [JSON.stringify({ mutationId: "mutation-1" }), JSON.stringify({ mutationId: "mutation-1" })]);
    assert.equal(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh")).length, 1);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("an unsafe authenticated request can replay after caller-provided credential bootstrap", async () => {
  const originalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined }
  });
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  let protectedCalls = 0;
  const fetchMock = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith("/auth/refresh")) return new Response("unauthorized", { status: 401 });
    protectedCalls += 1;
    return new Response("{}", { status: protectedCalls === 1 ? 401 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const bootstrapAuthOn401 = vi.fn(async () => true);
  const app = { googleAuthEpoch: 0, hasProAccess: false };

  try {
    const response = await fetchAuthenticatedApiResponse(app as never, "/workspaces", {
      method: "POST",
      headers: [["x-bootstrap-tag", "mutation-2"]],
      body: JSON.stringify({ mutationId: "mutation-2" })
    }, { expireAuthOn401: false, bootstrapAuthOn401 });

    assert.equal(response.status, 200);
    assert.equal(bootstrapAuthOn401.mock.calls.length, 1);
    assert.equal(protectedCalls, 2);
    const protectedCallsWithHeaders = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/workspaces"));
    assert.equal(new Headers(protectedCallsWithHeaders[0]?.[1]?.headers).get("x-bootstrap-tag"), "mutation-2");
    assert.equal(new Headers(protectedCallsWithHeaders[1]?.[1]?.headers).get("x-bootstrap-tag"), "mutation-2");
    assert.equal(app.googleAuthEpoch, 0);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("caller abort cancels a response body read after fetch has returned headers", async () => {
  const controller = new AbortController();
  let bodyCancelled = false;
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
    start() {},
    cancel() { bodyCancelled = true; }
  }), { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);

  const response = await fetchWithRetry("https://api.example.test/stream", { method: "GET", signal: controller.signal });
  const reading = response.json();
  const rejected = assert.rejects(reading, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  controller.abort();

  await rejected;
  assert.equal(bodyCancelled, true);
});
