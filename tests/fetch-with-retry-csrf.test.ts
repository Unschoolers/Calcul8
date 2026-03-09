import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { CSRF_TOKEN_KEY, fetchWithRetry } from "../src/app-core/methods/ui/shared.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function withMockedLocalStorage(run: (data: Map<string, string>) => Promise<void> | void): Promise<void> | void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();
  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  const restore = () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  };

  try {
    const result = run(data);
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return;
  } catch (error) {
    restore();
    throw error;
  }
}

beforeEach(() => {
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("fetchWithRetry stores csrf token from response and sends it on unsafe requests", async () => {
  await withMockedLocalStorage(async (data) => {
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: {
            "x-csrf-token": "csrf-token-1"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithRetry("https://api.example.test/auth/me", {
      method: "GET"
    });
    assert.equal(data.get(CSRF_TOKEN_KEY), "csrf-token-1");

    await fetchWithRetry("https://api.example.test/sync/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondHeaders = new Headers(secondInit?.headers);
    assert.equal(secondHeaders.get("x-csrf-token"), "csrf-token-1");
  });
});

test("fetchWithRetry does not overwrite existing csrf header", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(CSRF_TOKEN_KEY, "csrf-token-stored");
    const fetchMock = vi.fn(async () =>
      new Response("{}", {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithRetry("https://api.example.test/sync/push", {
      method: "POST",
      headers: {
        "x-csrf-token": "csrf-explicit"
      },
      body: "{}"
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-csrf-token"), "csrf-explicit");
  });
});
