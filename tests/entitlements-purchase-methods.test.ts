import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  resolvePurchaseProviderMock,
  getSupportedPurchaseProvidersMock,
  resolveApiBaseUrlMock,
  fetchWithRetryMock,
  handleExpiredAuthMock,
  submitPlayPurchaseVerificationMock,
  hasPlayPurchaseSupportMock,
  getPlayBillingServiceMock,
  isPlayBillingPaymentRequestSupportedMock,
  purchasePlayProductMock,
  extractPurchaseTokenFromResultMock,
  isAlreadyOwnedPurchaseErrorMock,
  formatPlayPurchaseErrorMock
} = vi.hoisted(() => ({
  resolvePurchaseProviderMock: vi.fn(),
  getSupportedPurchaseProvidersMock: vi.fn(() => ["play", "stripe"]),
  resolveApiBaseUrlMock: vi.fn(),
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  submitPlayPurchaseVerificationMock: vi.fn(),
  hasPlayPurchaseSupportMock: vi.fn(),
  getPlayBillingServiceMock: vi.fn(),
  isPlayBillingPaymentRequestSupportedMock: vi.fn(() => true),
  purchasePlayProductMock: vi.fn(),
  extractPurchaseTokenFromResultMock: vi.fn(),
  isAlreadyOwnedPurchaseErrorMock: vi.fn(() => false),
  formatPlayPurchaseErrorMock: vi.fn(() => "purchase error")
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  resolvePurchaseProvider: resolvePurchaseProviderMock,
  getSupportedPurchaseProviders: getSupportedPurchaseProvidersMock,
  GOOGLE_TOKEN_KEY: "whatfees_google_id_token",
  resolveApiBaseUrl: resolveApiBaseUrlMock,
  fetchWithRetry: fetchWithRetryMock,
  handleExpiredAuth: handleExpiredAuthMock,
  submitPlayPurchaseVerification: submitPlayPurchaseVerificationMock
}));

vi.mock("../src/app-core/methods/ui/entitlements-shared.ts", () => ({
  hasPlayPurchaseSupport: hasPlayPurchaseSupportMock,
  isAlreadyOwnedPurchaseError: isAlreadyOwnedPurchaseErrorMock,
  formatPlayPurchaseError: formatPlayPurchaseErrorMock
}));

vi.mock("../src/app-core/utils/playBilling.ts", () => ({
  getPlayBillingService: getPlayBillingServiceMock,
  isPlayBillingPaymentRequestSupported: isPlayBillingPaymentRequestSupportedMock,
  purchasePlayProduct: purchasePlayProductMock,
  extractPurchaseTokenFromResult: extractPurchaseTokenFromResultMock
}));

import { uiEntitlementPurchaseMethods } from "../src/app-core/methods/ui/entitlements-purchase.ts";

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

function createContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isVerifyingPurchase: false,
    hasProAccess: false,
    purchaseTokenInput: "",
    purchaseProductIdInput: "pro_access",
    purchasePackageNameInput: "",
    showVerifyPurchaseModal: true,
    googleAvatarLoadFailed: false,
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined),
    startPlayPurchase: vi.fn(async () => undefined),
    verifyPlayPurchase: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePurchaseProviderMock.mockReturnValue("auto");
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    async json() {
      return {
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123"
      };
    }
  });
  hasPlayPurchaseSupportMock.mockResolvedValue(false);
  getPlayBillingServiceMock.mockResolvedValue(null);
  submitPlayPurchaseVerificationMock.mockResolvedValue(true);
  purchasePlayProductMock.mockResolvedValue({ purchaseToken: "tok_1" });
  extractPurchaseTokenFromResultMock.mockReturnValue({ purchaseToken: null, itemId: null });
});

test("startProPurchase routes to Play flow when provider is auto and Play supported", async () => {
  const ctx = createContext();
  hasPlayPurchaseSupportMock.mockResolvedValue(true);

  await uiEntitlementPurchaseMethods.startProPurchase.call(ctx as never);

  assert.equal((ctx.startPlayPurchase as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("startProPurchase falls back to Stripe checkout when provider is auto and Play is unavailable", async () => {
  await withMockedLocalStorage(async () => {
    const ctx = createContext();
    resolvePurchaseProviderMock.mockReturnValue("auto");
    hasPlayPurchaseSupportMock.mockResolvedValue(false);
    resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");

    const assignMock = vi.fn();
    const originalWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          assign: assignMock
        }
      }
    });

    try {
      await uiEntitlementPurchaseMethods.startProPurchase.call(ctx as never);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
    }

    assert.equal(fetchWithRetryMock.mock.calls.length, 1);
    assert.equal(assignMock.mock.calls[0]?.[0], "https://checkout.stripe.com/c/pay/cs_test_123");
  });
});

test("startProPurchase shows info when provider unsupported", async () => {
  const ctx = createContext();
  resolvePurchaseProviderMock.mockReturnValue("custom-gateway");

  await uiEntitlementPurchaseMethods.startProPurchase.call(ctx as never);

  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "custom-gateway purchases are not enabled yet. Supported providers: play, stripe.");
});

test("startProPurchase routes to Stripe checkout when provider is stripe", async () => {
  await withMockedLocalStorage(async () => {
    const ctx = createContext();
    resolvePurchaseProviderMock.mockReturnValue("stripe");
    resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");

    const assignMock = vi.fn();
    const originalWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          assign: assignMock
        }
      }
    });

    try {
      await uiEntitlementPurchaseMethods.startProPurchase.call(ctx as never);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
    }

    assert.equal(fetchWithRetryMock.mock.calls.length, 1);
    assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://api.example.test/billing/checkout-session");
    assert.equal(assignMock.mock.calls[0]?.[0], "https://checkout.stripe.com/c/pay/cs_test_123");
  });
});

test("startPlayPurchase can proceed without local Google token (cookie-first)", async () => {
  await withMockedLocalStorage(async () => {
    const ctx = createContext();
    resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");

    await uiEntitlementPurchaseMethods.startPlayPurchase.call(ctx as never);

    assert.equal(submitPlayPurchaseVerificationMock.mock.calls.length, 1);
    assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Purchase verified. Pro features unlocked.");
  });
});

test("startPlayPurchase verifies existing purchase before new purchase", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");

    const listPurchases = vi.fn(async () => ({ data: "ignored" }));
    getPlayBillingServiceMock.mockResolvedValue({
      listPurchases
    });
    extractPurchaseTokenFromResultMock.mockReturnValue({
      purchaseToken: "existing_purchase_token",
      itemId: "pro_access"
    });

    const ctx = createContext({
      purchaseProductIdInput: "pro_access",
      purchaseTokenInput: "will-be-cleared",
      purchasePackageNameInput: "io.app.pkg"
    });

    await uiEntitlementPurchaseMethods.startPlayPurchase.call(ctx as never);

    assert.equal(listPurchases.mock.calls.length, 1);
    assert.equal(submitPlayPurchaseVerificationMock.mock.calls.length, 1);
    assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Existing purchase found and verified. Pro features unlocked.");
    assert.equal(ctx.purchaseTokenInput, "");
    assert.equal(ctx.purchaseProductIdInput, "");
    assert.equal(ctx.purchasePackageNameInput, "");
    assert.equal(ctx.showVerifyPurchaseModal, false);
    assert.equal(ctx.isVerifyingPurchase, false);
  });
});

test("startPlayPurchase recovers already-owned error without requiring a second tap", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");

    const alreadyOwnedError = new Error("ITEM_ALREADY_OWNED");
    const listPurchases = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ data: "precheck-empty" })
      .mockResolvedValueOnce({ data: "precheck-empty" })
      .mockResolvedValueOnce({ data: "precheck-empty" })
      .mockResolvedValueOnce({ data: "precheck-empty" })
      .mockResolvedValueOnce({ data: "recovery-empty" })
      .mockResolvedValueOnce({ data: "recovery-has-token" });

    getPlayBillingServiceMock.mockResolvedValue({ listPurchases });
    purchasePlayProductMock.mockRejectedValue(alreadyOwnedError);
    isAlreadyOwnedPurchaseErrorMock.mockReturnValue(true);
    extractPurchaseTokenFromResultMock
      .mockReturnValueOnce({ purchaseToken: null, itemId: null })
      .mockReturnValueOnce({ purchaseToken: null, itemId: null })
      .mockReturnValueOnce({ purchaseToken: null, itemId: null })
      .mockReturnValueOnce({ purchaseToken: null, itemId: null })
      .mockReturnValueOnce({ purchaseToken: null, itemId: null })
      .mockReturnValueOnce({ purchaseToken: "recovered_token", itemId: "pro_access" });

    const ctx = createContext({
      purchaseProductIdInput: "pro_access",
      purchaseTokenInput: "will-be-cleared",
      purchasePackageNameInput: "io.app.pkg"
    });

    await uiEntitlementPurchaseMethods.startPlayPurchase.call(ctx as never);

    assert.equal(purchasePlayProductMock.mock.calls.length, 1);
    assert.equal(listPurchases.mock.calls.length, 6);
    assert.equal(submitPlayPurchaseVerificationMock.mock.calls.length, 1);
    assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Existing purchase found and verified. Pro features unlocked.");
    assert.equal(ctx.purchaseTokenInput, "");
    assert.equal(ctx.purchaseProductIdInput, "");
    assert.equal(ctx.purchasePackageNameInput, "");
    assert.equal(ctx.showVerifyPurchaseModal, false);
    assert.equal(ctx.isVerifyingPurchase, false);
  });
});

test("verifyPlayPurchase validates token then verifies and closes modal", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    const ctx = createContext({
      purchaseTokenInput: "purchase-token-123",
      purchaseProductIdInput: "pro_access",
      purchasePackageNameInput: "io.example.app"
    });

    await uiEntitlementPurchaseMethods.verifyPlayPurchase.call(ctx as never);

    assert.equal(submitPlayPurchaseVerificationMock.mock.calls.length, 1);
    assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Purchase verified. Pro features unlocked.");
    assert.equal(ctx.purchaseTokenInput, "");
    assert.equal(ctx.showVerifyPurchaseModal, false);
    assert.equal(ctx.isVerifyingPurchase, false);
  });
});

test("verifyPlayPurchase warns when token is missing", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    const ctx = createContext({
      purchaseTokenInput: "   "
    });

    await uiEntitlementPurchaseMethods.verifyPlayPurchase.call(ctx as never);

    assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Enter a purchase token to continue.");
    assert.equal(submitPlayPurchaseVerificationMock.mock.calls.length, 0);
  });
});

test("verifyProPurchase refreshes entitlement when provider is stripe", async () => {
  const ctx = createContext({
    hasProAccess: true,
    debugLogEntitlement: vi.fn(async () => undefined)
  });
  resolvePurchaseProviderMock.mockReturnValue("stripe");

  await uiEntitlementPurchaseMethods.verifyProPurchase.call(ctx as never);

  assert.equal((ctx.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Purchase verified. Pro features unlocked.");
});

test("verifyProPurchase falls back to Stripe verification when provider is auto and Play is unavailable", async () => {
  const ctx = createContext({
    hasProAccess: false,
    debugLogEntitlement: vi.fn(async () => undefined)
  });
  resolvePurchaseProviderMock.mockReturnValue("auto");
  hasPlayPurchaseSupportMock.mockResolvedValue(false);

  await uiEntitlementPurchaseMethods.verifyProPurchase.call(ctx as never);

  assert.equal((ctx.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length >= 1, true);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "No completed Stripe purchase found yet. Try again in a few seconds.");
});
