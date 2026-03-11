import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  resolvePurchaseProviderMock,
  getSupportedPurchaseProvidersMock,
  hasPlayPurchaseSupportMock
} = vi.hoisted(() => ({
  resolvePurchaseProviderMock: vi.fn(),
  getSupportedPurchaseProvidersMock: vi.fn(() => ["play", "stripe"]),
  hasPlayPurchaseSupportMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app-core/methods/ui/shared.ts")>();
  return {
    ...actual,
    resolvePurchaseProvider: resolvePurchaseProviderMock,
    getSupportedPurchaseProviders: getSupportedPurchaseProvidersMock
  };
});

vi.mock("../src/app-core/methods/ui/entitlements-shared.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app-core/methods/ui/entitlements-shared.ts")>();
  return {
    ...actual,
    hasPlayPurchaseSupport: hasPlayPurchaseSupportMock
  };
});

import {
  startPlayPurchaseFlow,
  startProPurchaseFlow,
  verifyPlayPurchaseFlow,
  verifyProPurchaseFlow
} from "../src/app-core/methods/ui/entitlements-purchase-service.ts";

function createApp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isVerifyingPurchase: false,
    hasProAccess: false,
    googleAuthEpoch: 0,
    purchaseTokenInput: "",
    purchaseProductIdInput: "pro_access",
    purchasePackageNameInput: "",
    showVerifyPurchaseModal: true,
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePurchaseProviderMock.mockReturnValue("auto");
  hasPlayPurchaseSupportMock.mockResolvedValue(false);
});

test("startProPurchaseFlow routes auto provider to Play when Play is supported", async () => {
  const app = createApp();
  const startPlayPurchase = vi.fn(async () => undefined);
  const runStripePurchaseFlow = vi.fn(async () => undefined);
  hasPlayPurchaseSupportMock.mockResolvedValue(true);

  await startProPurchaseFlow(app as never, {
    startPlayPurchase,
    runStripePurchaseFlow
  });

  assert.equal(startPlayPurchase.mock.calls.length, 1);
  assert.equal(runStripePurchaseFlow.mock.calls.length, 0);
});

test("verifyProPurchaseFlow routes auto provider to Stripe when Play is unavailable", async () => {
  const app = createApp();
  const verifyPlayPurchase = vi.fn(async () => undefined);
  const runStripeVerificationFlow = vi.fn(async () => undefined);
  hasPlayPurchaseSupportMock.mockResolvedValue(false);

  await verifyProPurchaseFlow(app as never, {
    verifyPlayPurchase,
    runStripeVerificationFlow
  });

  assert.equal(verifyPlayPurchase.mock.calls.length, 0);
  assert.equal(runStripeVerificationFlow.mock.calls.length, 1);
});

test("startProPurchaseFlow shows info when provider is unsupported", async () => {
  const app = createApp();
  resolvePurchaseProviderMock.mockReturnValue("custom-gateway");

  await startProPurchaseFlow(app as never, {
    startPlayPurchase: vi.fn(),
    runStripePurchaseFlow: vi.fn()
  });

  assert.equal((app.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "custom-gateway purchases are not enabled yet. Supported providers: play, stripe.");
});

test("startPlayPurchaseFlow validates missing API base configuration", async () => {
  const app = createApp();

  await startPlayPurchaseFlow(app as never, {
    resolveApiBaseUrl: () => ""
  });

  assert.equal((app.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Missing API configuration (VITE_API_BASE_URL).");
});

test("verifyPlayPurchaseFlow warns when token is missing", async () => {
  const app = createApp({
    purchaseTokenInput: "   "
  });

  await verifyPlayPurchaseFlow(app as never, {
    resolveApiBaseUrl: () => "https://api.example.test"
  });

  assert.equal((app.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Enter a purchase token to continue.");
});
