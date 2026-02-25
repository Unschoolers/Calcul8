import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const { getPlayBillingServiceMock } = vi.hoisted(() => ({
  getPlayBillingServiceMock: vi.fn()
}));

vi.mock("../src/app-core/utils/playBilling.ts", () => ({
  getPlayBillingService: getPlayBillingServiceMock
}));

import {
  ENTITLEMENT_CACHE_KEY,
  PRO_ACCESS_KEY
} from "../src/app-core/methods/ui/shared.ts";
import {
  applyTargetProfitAccessDefaults,
  cacheGoogleProfileFromToken,
  formatPlayPurchaseError,
  hasPlayPurchaseSupport,
  isAlreadyOwnedPurchaseError
} from "../src/app-core/methods/ui/entitlements-shared.ts";
import {
  applyCachedEntitlement,
  applyFetchedEntitlement,
  parseEntitlementPayload,
  shouldUseCachedEntitlement
} from "../src/app-core/methods/ui/entitlements-status-service.ts";

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

function buildIdToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `header.${payload}.sig`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("atob", (value: string) => Buffer.from(value, "base64").toString("binary"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("cacheGoogleProfileFromToken decodes claims and merges with previous cached profile", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("google_profile_cache", JSON.stringify({
      name: "",
      email: "saved@example.com",
      picture: "old-picture"
    }));
    const token = buildIdToken({
      name: "  Alice  ",
      picture: "  new-picture  "
    });

    cacheGoogleProfileFromToken(token, "google_profile_cache");

    const parsed = JSON.parse(data.get("google_profile_cache") || "{}");
    assert.equal(parsed.name, "Alice");
    assert.equal(parsed.email, "saved@example.com");
    assert.equal(parsed.picture, "new-picture");
  });
});

test("cacheGoogleProfileFromToken ignores invalid payloads and empty claims", async () => {
  await withMockedLocalStorage(async (data) => {
    cacheGoogleProfileFromToken("invalid-token", "google_profile_cache");
    assert.equal(data.has("google_profile_cache"), false);

    const tokenWithoutUsefulClaims = buildIdToken({});
    cacheGoogleProfileFromToken(tokenWithoutUsefulClaims, "google_profile_cache");
    assert.equal(data.has("google_profile_cache"), false);
  });
});

test("formatPlayPurchaseError and isAlreadyOwnedPurchaseError classify known failure shapes", () => {
  assert.equal(formatPlayPurchaseError(new Error("boom")), "Error: boom");
  assert.equal(formatPlayPurchaseError("plain"), "plain");
  assert.equal(formatPlayPurchaseError({ code: "X", message: "Oops" }), "code=X | Oops");
  assert.equal(formatPlayPurchaseError({}), "Unknown purchase error.");

  assert.equal(isAlreadyOwnedPurchaseError({ code: 7 }), true);
  assert.equal(isAlreadyOwnedPurchaseError({ details: { responseCode: "ITEM_ALREADY_OWNED" } }), true);
  assert.equal(isAlreadyOwnedPurchaseError({ reason: "already_owned" }), true);
  assert.equal(isAlreadyOwnedPurchaseError(new Error("Item already owned by user")), true);
  assert.equal(isAlreadyOwnedPurchaseError({ code: "5", message: "other" }), false);
});

test("applyTargetProfitAccessDefaults enforces defaults based on lot selection and Pro access", () => {
  const nonSelected = {
    hasLotSelected: false,
    hasProAccess: false,
    targetProfitPercent: 35,
    autoSaveSetup: vi.fn()
  };
  applyTargetProfitAccessDefaults(nonSelected as never);
  assert.equal(nonSelected.targetProfitPercent, 35);
  assert.equal(nonSelected.autoSaveSetup.mock.calls.length, 0);

  const nonPro = {
    hasLotSelected: true,
    hasProAccess: false,
    targetProfitPercent: 12,
    autoSaveSetup: vi.fn()
  };
  applyTargetProfitAccessDefaults(nonPro as never);
  assert.equal(nonPro.targetProfitPercent, 0);
  assert.equal(nonPro.autoSaveSetup.mock.calls.length, 1);

  const pro = {
    hasLotSelected: true,
    hasProAccess: true,
    targetProfitPercent: 0,
    autoSaveSetup: vi.fn()
  };
  applyTargetProfitAccessDefaults(pro as never);
  assert.equal(pro.targetProfitPercent, 15);
  assert.equal(pro.autoSaveSetup.mock.calls.length, 1);
});

test("hasPlayPurchaseSupport returns true only when API exists and billing service resolves", async () => {
  vi.stubGlobal("window", {});
  assert.equal(await hasPlayPurchaseSupport(), false);

  vi.stubGlobal("window", {
    getDigitalGoodsService: vi.fn()
  });
  getPlayBillingServiceMock.mockResolvedValueOnce(null);
  assert.equal(await hasPlayPurchaseSupport(), false);

  getPlayBillingServiceMock.mockResolvedValueOnce({ listPurchases: vi.fn() });
  assert.equal(await hasPlayPurchaseSupport(), true);
});

test("status-service cache policy and payload parsing handle edge cases", () => {
  const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    assert.equal(shouldUseCachedEntitlement({
      cachedAt: Number.NaN,
      googleIdToken: "token",
      forceRefresh: false,
      ttlMs: 1000
    }), false);
    assert.equal(shouldUseCachedEntitlement({
      cachedAt: 999_500,
      googleIdToken: "",
      forceRefresh: false,
      ttlMs: 1000
    }), true);
    assert.equal(shouldUseCachedEntitlement({
      cachedAt: 999_500,
      googleIdToken: "token",
      forceRefresh: true,
      ttlMs: 1000
    }), false);
    assert.equal(shouldUseCachedEntitlement({
      cachedAt: 999_500,
      googleIdToken: "token",
      forceRefresh: false,
      ttlMs: 1000
    }), true);
    assert.equal(shouldUseCachedEntitlement({
      cachedAt: 997_000,
      googleIdToken: "token",
      forceRefresh: false,
      ttlMs: 1000
    }), false);
  } finally {
    nowSpy.mockRestore();
  }

  assert.deepEqual(parseEntitlementPayload({
    userId: "user",
    hasProAccess: 1 as unknown as boolean,
    updatedAt: 123 as unknown as string
  }), {
    userId: "user",
    hasProAccess: true,
    updatedAt: null
  });
});

test("applyCachedEntitlement and applyFetchedEntitlement persist entitlement state", async () => {
  await withMockedLocalStorage(async (data) => {
    const app = {
      hasLotSelected: true,
      hasProAccess: false,
      targetProfitPercent: 0,
      autoSaveSetup: vi.fn()
    };

    applyCachedEntitlement(app as never, {
      userId: "user-1",
      hasProAccess: true,
      updatedAt: "2026-02-24T00:00:00Z"
    });
    assert.equal(app.hasProAccess, true);
    assert.equal(data.get(PRO_ACCESS_KEY), "1");

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456789);
    try {
      applyFetchedEntitlement(app as never, {
        userId: "user-2",
        hasProAccess: false,
        updatedAt: "2026-02-25T00:00:00Z"
      });
    } finally {
      nowSpy.mockRestore();
    }

    const cache = JSON.parse(data.get(ENTITLEMENT_CACHE_KEY) || "{}");
    assert.equal(cache.userId, "user-2");
    assert.equal(cache.hasProAccess, false);
    assert.equal(cache.updatedAt, "2026-02-25T00:00:00Z");
    assert.equal(cache.cachedAt, 123456789);
  });
});
