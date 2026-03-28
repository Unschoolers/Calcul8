import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  AUTH_CSRF_TOKEN_KEY,
  GOOGLE_AUTH_TOKEN_KEY
} from "../src/app-core/auth/index.ts";
import {
  hasAuthSignal,
  hasGoogleBootstrapToken,
  hasServerSession
} from "../src/app-core/auth/state.ts";

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

test("hasAuthSignal is false when no auth storage is present", () => {
  assert.equal(hasGoogleBootstrapToken(), false);
  assert.equal(hasServerSession(), false);
  assert.equal(hasAuthSignal(), false);
});

test("hasAuthSignal is true when a Google bootstrap token exists", () => {
  localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, "google-token");

  assert.equal(hasGoogleBootstrapToken(), true);
  assert.equal(hasAuthSignal(), true);
});

test("hasAuthSignal is true when a server session exists", () => {
  localStorage.setItem(AUTH_CSRF_TOKEN_KEY, "csrf-token");

  assert.equal(hasServerSession(), true);
  assert.equal(hasAuthSignal(), true);
});
