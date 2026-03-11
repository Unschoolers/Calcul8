import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  resolveApiBaseUrlMock,
  fetchWithRetryMock,
  handleExpiredAuthMock
} = vi.hoisted(() => ({
  resolveApiBaseUrlMock: vi.fn(),
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  resolveApiBaseUrl: resolveApiBaseUrlMock,
  fetchWithRetry: fetchWithRetryMock,
  handleExpiredAuth: handleExpiredAuthMock,
  GOOGLE_TOKEN_KEY: "whatfees_google_id_token"
}));

import {
  handleStripeCheckoutReturn,
  runStripePurchaseFlow,
  runStripeVerificationFlow
} from "../src/app-core/methods/ui/entitlements-stripe.ts";

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
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("runStripePurchaseFlow creates checkout session and redirects", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    const ctx = createContext();

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
      await runStripePurchaseFlow(ctx as never);
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

test("runStripePurchaseFlow handles 401 by expiring auth state", async () => {
  await withMockedLocalStorage(async () => {
    const ctx = createContext();
    fetchWithRetryMock.mockResolvedValue({
      ok: false,
      status: 401,
      async json() {
        return {};
      }
    });

    await runStripePurchaseFlow(ctx as never);

    assert.equal(handleExpiredAuthMock.mock.calls.length, 1);
    assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Your sign-in expired. Please sign in again.");
  });
});

test("runStripePurchaseFlow opens embedded checkout when client secret and Stripe key are available", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "pk_test_123");

    fetchWithRetryMock.mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return {
          clientSecret: "cs_test_embedded_secret_123"
        };
      }
    });

    const assignMock = vi.fn();
    const stripeMountMock = vi.fn();
    const stripeInitEmbeddedCheckoutMock = vi.fn(async () => ({
      mount: stripeMountMock,
      destroy: vi.fn()
    }));
    const stripeFactoryMock = vi.fn(() => ({
      initEmbeddedCheckout: stripeInitEmbeddedCheckoutMock
    }));

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        Stripe: stripeFactoryMock,
        location: {
          assign: assignMock
        },
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout
      }
    });

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: vi.fn(() => ({ innerHTML: "" }))
      }
    });

    const ctx = createContext({
      showStripeCheckoutModal: false,
      stripeCheckoutClientSecret: "",
      $nextTick: vi.fn(async (cb: () => void) => {
        cb();
      })
    });

    await runStripePurchaseFlow(ctx as never);

    assert.equal(ctx.showStripeCheckoutModal, true);
    assert.equal(ctx.stripeCheckoutClientSecret, "cs_test_embedded_secret_123");
    assert.equal(stripeFactoryMock.mock.calls[0]?.[0], "pk_test_123");
    assert.equal(stripeInitEmbeddedCheckoutMock.mock.calls.length, 1);
    assert.equal(stripeMountMock.mock.calls.length, 1);
    assert.equal(assignMock.mock.calls.length, 0);
  });
});

test("runStripePurchaseFlow falls back to hosted checkout when embedded mount is unavailable", async () => {
  await withMockedLocalStorage(async () => {
    vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "pk_test_123");

    fetchWithRetryMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        async json() {
          return {
            clientSecret: "cs_test_embedded_secret_123"
          };
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        async json() {
          return {
            checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123"
          };
        }
      });

    const assignMock = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          assign: assignMock
        },
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout
      }
    });

    const ctx = createContext({
      showStripeCheckoutModal: false,
      stripeCheckoutClientSecret: "",
      $nextTick: vi.fn(async (cb: () => void) => {
        cb();
      })
    });

    await runStripePurchaseFlow(ctx as never);

    assert.equal(fetchWithRetryMock.mock.calls.length, 2);
    const firstPayload = JSON.parse(String(fetchWithRetryMock.mock.calls[0]?.[1]?.body || "{}")) as { uiMode?: string };
    const secondPayload = JSON.parse(String(fetchWithRetryMock.mock.calls[1]?.[1]?.body || "{}")) as { uiMode?: string };
    assert.equal(firstPayload.uiMode, "embedded");
    assert.equal(secondPayload.uiMode, "hosted");
    assert.equal(assignMock.mock.calls[0]?.[0], "https://checkout.stripe.com/c/pay/cs_test_123");
  });
});

test("runStripeVerificationFlow refreshes entitlement and notifies", async () => {
  vi.useFakeTimers();
  const ctx = createContext({
    hasProAccess: false,
    debugLogEntitlement: vi.fn(async () => {
      ctx.hasProAccess = true;
    })
  });

  const verificationPromise = runStripeVerificationFlow(ctx as never);
  await vi.runAllTimersAsync();
  await verificationPromise;

  assert.equal((ctx.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Purchase verified. Pro features unlocked.");
});

test("handleStripeCheckoutReturn force-refreshes entitlement on success return and cleans URL", async () => {
  vi.useFakeTimers();
  const ctx = createContext({
    hasProAccess: false,
    debugLogEntitlement: vi.fn(async () => {
      ctx.hasProAccess = true;
    })
  });

  const replaceStateMock = vi.fn();
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalHistory = (globalThis as { history?: unknown }).history;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://app.whatfees.ca/?checkout=success&session_id=cs_test_123&foo=bar",
        pathname: "/",
        search: "?checkout=success&session_id=cs_test_123&foo=bar",
        hash: ""
      }
    }
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      replaceState: replaceStateMock
    }
  });

  try {
    const returnPromise = handleStripeCheckoutReturn(ctx as never);
    await vi.runAllTimersAsync();
    await returnPromise;
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: originalHistory
    });
  }

  assert.equal((ctx.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length >= 1, true);
  assert.equal((ctx.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], true);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Purchase verified. Pro features unlocked.");
  assert.equal(replaceStateMock.mock.calls.length, 1);
  assert.equal(replaceStateMock.mock.calls[0]?.[2], "/?foo=bar");
});

test("handleStripeCheckoutReturn notifies on cancel and cleans URL", async () => {
  const ctx = createContext();
  const replaceStateMock = vi.fn();
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalHistory = (globalThis as { history?: unknown }).history;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://app.whatfees.ca/?checkout=cancel",
        pathname: "/",
        search: "?checkout=cancel",
        hash: ""
      }
    }
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      replaceState: replaceStateMock
    }
  });

  try {
    await handleStripeCheckoutReturn(ctx as never);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: originalHistory
    });
  }

  assert.equal((ctx.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Checkout canceled. No charge was made.");
  assert.equal(replaceStateMock.mock.calls[0]?.[2], "/");
});
