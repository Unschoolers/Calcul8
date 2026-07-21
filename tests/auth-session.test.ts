import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  buildBootstrapBearerHeaders,
  buildSessionHeaders,
  getStoredCsrfToken,
  getStoredGoogleIdToken,
  getStoredSessionUserId,
  GOOGLE_PROFILE_CACHE_KEY,
  setStoredCsrfToken,
  setStoredGoogleIdToken
} from "../src/app-core/auth/index.ts";
import {
  bootstrapServerSession,
  bootstrapServerSessionStatus
} from "../src/app-core/methods/ui/auth/auth-session.ts";
import { STORAGE_KEYS } from "../src/app-core/storageKeys.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(seed: Record<string, string> = {}): MockStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    }
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMockStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("buildSessionHeaders preserves caller headers without reading or attaching Google auth", () => {
  setStoredGoogleIdToken("google-token");
  const headers = buildSessionHeaders({ "Content-Type": "application/json" });
  assert.deepEqual(headers, { "Content-Type": "application/json" });
});

test("buildBootstrapBearerHeaders attaches only an explicitly supplied token", () => {
  setStoredGoogleIdToken("stored-token-that-must-not-be-read");
  const headers = buildBootstrapBearerHeaders("bootstrap-token", {
    "Content-Type": "application/json"
  });
  assert.deepEqual(headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer bootstrap-token"
  });
});

test("buildBootstrapBearerHeaders omits authorization for an empty token", () => {
  assert.deepEqual(buildBootstrapBearerHeaders("   "), {});
});

test("bootstrapServerSession sends bearer only to the auth bootstrap endpoint", async () => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.test"
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  setStoredGoogleIdToken("google-token");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ userId: "user-1" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "csrf-token"
      }
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  const bootstrapped = await bootstrapServerSession({ googleAuthEpoch: 0 }, "https://api.example.test/");

  assert.equal(bootstrapped, true);
  assert.equal(getStoredSessionUserId(), "user-1");
  const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
  const headers = new Headers(requestInit.headers);
  assert.equal(fetchMock.mock.calls[0]?.[0], "https://api.example.test/auth/me");
  assert.equal(headers.get("Authorization"), "Bearer google-token");
});

test("bootstrapServerSession restores the public profile used by the account avatar", async () => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.test"
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({
      userId: "user-1",
      profile: {
        displayName: "Alice Example",
        photoUrl: "https://images.example.test/alice.jpg"
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  const app = {
    googleAuthEpoch: 4,
    googleAvatarLoadFailed: true
  };

  const bootstrapped = await bootstrapServerSession(app, "https://api.example.test/");

  assert.equal(bootstrapped, true);
  assert.deepEqual(JSON.parse(localStorage.getItem(GOOGLE_PROFILE_CACHE_KEY) || "null"), {
    name: "Alice Example",
    email: "",
    picture: "https://images.example.test/alice.jpg"
  });
  assert.equal(app.googleAvatarLoadFailed, false);
  assert.equal(app.googleAuthEpoch, 5);
});

test("bootstrapServerSessionStatus marks only explicit 401 responses as expired", async () => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.test"
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  setStoredGoogleIdToken("google-token");
  setStoredCsrfToken("csrf-token");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response("bad request", {
      status: 400,
      statusText: "Bad Request"
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await bootstrapServerSessionStatus({ googleAuthEpoch: 0 }, "https://api.example.test/");

  assert.deepEqual(result, { ok: false, authExpired: false });
  assert.equal(getStoredGoogleIdToken(), "google-token");
  assert.equal(getStoredCsrfToken(), "csrf-token");
});

test("bootstrapServerSessionStatus clears session bootstrap secrets on 401", async () => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.test"
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  setStoredGoogleIdToken("google-token");
  setStoredCsrfToken("csrf-token");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(null, {
      status: 401,
      statusText: "Unauthorized"
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await bootstrapServerSessionStatus({ googleAuthEpoch: 0 }, "https://api.example.test/");

  assert.deepEqual(result, { ok: false, authExpired: true });
  assert.equal(getStoredCsrfToken(), "");
});

test("auth secrets hydrate from legacy storage once and remove persisted copies", () => {
  vi.stubGlobal("localStorage", createMockStorage({
    [STORAGE_KEYS.GOOGLE_ID_TOKEN]: " legacy-google-token ",
    [STORAGE_KEYS.CSRF_TOKEN]: " legacy-csrf-token "
  }));

  assert.equal(getStoredGoogleIdToken(), "legacy-google-token");
  assert.equal(getStoredCsrfToken(), "legacy-csrf-token");
  assert.equal(localStorage.getItem(STORAGE_KEYS.GOOGLE_ID_TOKEN), null);
  assert.equal(localStorage.getItem(STORAGE_KEYS.CSRF_TOKEN), null);
});

test("setting auth secrets keeps them in memory instead of browser storage", () => {
  setStoredGoogleIdToken("google-token");
  setStoredCsrfToken("csrf-token");

  assert.equal(getStoredGoogleIdToken(), "google-token");
  assert.equal(getStoredCsrfToken(), "csrf-token");
  assert.equal(localStorage.getItem(STORAGE_KEYS.GOOGLE_ID_TOKEN), null);
  assert.equal(localStorage.getItem(STORAGE_KEYS.CSRF_TOKEN), null);
});
