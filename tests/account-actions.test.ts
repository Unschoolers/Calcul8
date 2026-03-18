import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  handleExpiredAuthMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", async () => {
  const actual = await vi.importActual("../src/app-core/methods/ui/shared.ts") as object;
  return {
    ...actual,
    fetchWithRetry: fetchWithRetryMock,
    handleExpiredAuth: handleExpiredAuthMock,
    resolveApiBaseUrl: resolveApiBaseUrlMock
  };
});

import { uiAccountMethods } from "../src/app-core/methods/ui/account.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
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
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    get length(): number {
      return map.size;
    }
  };
}

function createResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

function createContext() {
  return {
    googleAuthEpoch: 0,
    hasProAccess: true,
    availableWorkspaces: [{ workspaceId: "ws_1", name: "Alpha", role: "owner", status: "active" }],
    workspaceMembers: [{ userId: "user-1", workspaceId: "ws_1", role: "owner", status: "active", updatedAt: "2026-03-18T00:00:00Z" }],
    showWorkspaceMembersModal: true,
    showLeaveWorkspaceModal: true,
    activeScopeType: "workspace" as "personal" | "workspace",
    activeWorkspaceId: "ws_1" as string | null,
    notify: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  fetchWithRetryMock.mockResolvedValue(createResponse({ ok: true }));
  vi.stubGlobal("localStorage", createMockStorage({
    whatfees_google_id_token: "token-123",
    whatfees_google_profile_cache_v1: JSON.stringify({ name: "Jules" }),
    whatfees_csrf_token_v1: "csrf-token",
    whatfees_entitlement_cache_v1: JSON.stringify({ userId: "user-1", hasProAccess: true, updatedAt: null, cachedAt: 1 }),
    whatfees_pro_access: "1",
    whatfees_active_scope_type: "workspace",
    whatfees_active_workspace_id: "ws_1",
    whatfees_presets: "[{\"id\":1}]",
    whatfees_sales_1: "[]"
  }));
  vi.stubGlobal("window", {
    setTimeout,
    location: {
      reload: vi.fn()
    },
    google: {
      accounts: {
        id: {
          disableAutoSelect: vi.fn(),
          cancel: vi.fn()
        }
      }
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("logoutCurrentSession signs out, clears local auth state, and reloads", async () => {
  const ctx = createContext();

  await uiAccountMethods.logoutCurrentSession.call(ctx as never);
  vi.runAllTimers();

  assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://api.example.test/auth/logout");
  assert.equal(localStorage.getItem("whatfees_google_id_token"), null);
  assert.equal(localStorage.getItem("whatfees_google_profile_cache_v1"), null);
  assert.equal(localStorage.getItem("whatfees_csrf_token_v1"), null);
  assert.equal(localStorage.getItem("whatfees_entitlement_cache_v1"), null);
  assert.equal(localStorage.getItem("whatfees_google_auto_signin_disabled_v1"), "1");
  assert.equal(ctx.hasProAccess, false);
  assert.equal(ctx.activeScopeType, "personal");
  assert.equal(ctx.activeWorkspaceId, null);
  assert.equal(ctx.googleAuthEpoch, 1);
  assert.equal((window.google.accounts.id.cancel as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((window.google.accounts.id.disableAutoSelect as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((window.location.reload as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("clearPersonalAccountData clears app storage and reloads after success", async () => {
  const ctx = createContext();

  await uiAccountMethods.clearPersonalAccountData.call(ctx as never);
  vi.runAllTimers();

  assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://api.example.test/account/delete");
  assert.equal(localStorage.getItem("whatfees_presets"), null);
  assert.equal(localStorage.getItem("whatfees_sales_1"), null);
  assert.equal(localStorage.getItem("whatfees_google_id_token"), null);
  assert.equal(localStorage.getItem("whatfees_google_auto_signin_disabled_v1"), "1");
  assert.equal(ctx.hasProAccess, false);
  assert.equal((window.location.reload as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});
