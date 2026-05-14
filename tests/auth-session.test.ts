import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  buildAuthenticatedHeaders,
  getStoredCsrfToken,
  getStoredGoogleIdToken,
  setStoredCsrfToken,
  setStoredGoogleIdToken
} from "../src/app-core/auth/index.ts";
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

test("buildAuthenticatedHeaders sends bearer token for bearer-required requests", () => {
  setStoredGoogleIdToken("google-token");

  const headers = buildAuthenticatedHeaders("bearer-required", {
    "Content-Type": "application/json"
  });

  assert.equal(headers.Authorization, "Bearer google-token");
  assert.equal(headers["Content-Type"], "application/json");
});

test("buildAuthenticatedHeaders bootstraps session-preferred requests with bearer token when no server session exists", () => {
  setStoredGoogleIdToken("google-token");

  const headers = buildAuthenticatedHeaders("session-preferred");

  assert.equal(headers.Authorization, "Bearer google-token");
});

test("buildAuthenticatedHeaders omits bearer token for session-preferred requests when a server session exists", () => {
  setStoredGoogleIdToken("google-token");
  setStoredCsrfToken("csrf-token");

  const headers = buildAuthenticatedHeaders("session-preferred");

  assert.equal("Authorization" in headers, false);
});

test("buildAuthenticatedHeaders keeps bearer token for bearer-required requests even when a server session exists", () => {
  setStoredGoogleIdToken("google-token");
  setStoredCsrfToken("csrf-token");

  const headers = buildAuthenticatedHeaders("bearer-required");

  assert.equal(headers.Authorization, "Bearer google-token");
});

test("buildAuthenticatedHeaders keeps bearer token for cross-origin session-preferred requests", () => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.test"
    }
  });
  setStoredGoogleIdToken("google-token");
  setStoredCsrfToken("csrf-token");

  const headers = buildAuthenticatedHeaders(
    "session-preferred",
    {},
    "https://api.example.test/entitlements/me"
  );

  assert.equal(headers.Authorization, "Bearer google-token");
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
