import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getPurchaseVerificationResultMock,
  getPlayPurchaseByTokenHashMock,
  upsertEntitlementMock,
  upsertPlayPurchaseMock,
  createPurchaseVerificationResultMock,
  verifyPlayProductPurchaseMock,
  acknowledgePlayProductPurchaseMock,
  assertPurchaseNotLinkedToDifferentUserMock,
  hashPurchaseTokenMock,
  shouldAcknowledgePurchaseMock
} = vi.hoisted(() => ({
  getPurchaseVerificationResultMock: vi.fn(),
  getPlayPurchaseByTokenHashMock: vi.fn(),
  upsertEntitlementMock: vi.fn(),
  upsertPlayPurchaseMock: vi.fn(),
  createPurchaseVerificationResultMock: vi.fn(),
  verifyPlayProductPurchaseMock: vi.fn(),
  acknowledgePlayProductPurchaseMock: vi.fn(),
  assertPurchaseNotLinkedToDifferentUserMock: vi.fn(),
  hashPurchaseTokenMock: vi.fn(),
  shouldAcknowledgePurchaseMock: vi.fn()
}));

vi.mock("../lib/cosmos", () => ({
  getPurchaseVerificationResult: getPurchaseVerificationResultMock,
  getPlayPurchaseByTokenHash: getPlayPurchaseByTokenHashMock,
  upsertEntitlement: upsertEntitlementMock,
  upsertPlayPurchase: upsertPlayPurchaseMock,
  createPurchaseVerificationResult: createPurchaseVerificationResultMock
}));

vi.mock("../lib/googlePlay", () => ({
  verifyPlayProductPurchase: verifyPlayProductPurchaseMock,
  acknowledgePlayProductPurchase: acknowledgePlayProductPurchaseMock
}));

vi.mock("../lib/playEntitlements", () => ({
  assertPurchaseNotLinkedToDifferentUser: assertPurchaseNotLinkedToDifferentUserMock,
  hashPurchaseToken: hashPurchaseTokenMock,
  shouldAcknowledgePurchase: shouldAcknowledgePurchaseMock
}));

import { verifyPlayEntitlementRequest } from "./entitlementsVerifyPlay";

function createConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs",
    ...overrides
  };
}

function createRequest(body: unknown, headers: Record<string, string> = {}) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    method: "POST",
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    },
    async json() {
      return body;
    }
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = (async (input: unknown) => {
    const raw = String(input);
    const tokenMatch = /[?&]id_token=([^&]+)/.exec(raw);
    const decodedToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "unknown-user";
    return {
      ok: true,
      json: async () => ({
        sub: decodedToken
      })
    } as Response;
  }) as typeof fetch;
  getPurchaseVerificationResultMock.mockResolvedValue(null);
  getPlayPurchaseByTokenHashMock.mockResolvedValue(null);
  hashPurchaseTokenMock.mockReturnValue("token-hash");
  shouldAcknowledgePurchaseMock.mockReturnValue(false);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("verifyPlayEntitlementRequest replays stored idempotent response", async () => {
  getPurchaseVerificationResultMock.mockResolvedValue({
    responseStatus: 200,
    responseBody: { ok: true, replayed: true }
  });

  const response = await verifyPlayEntitlementRequest(
    createRequest(
      {
        purchaseToken: "token",
        idempotencyKey: "idem_key_1234"
      },
      { authorization: "Bearer user-1" }
    ) as never,
    createContext() as never,
    createConfig()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, { ok: true, replayed: true });
  assert.equal(verifyPlayProductPurchaseMock.mock.calls.length, 0);
});

test("verifyPlayEntitlementRequest returns pending for purchaseState=2", async () => {
  verifyPlayProductPurchaseMock.mockResolvedValue({
    isValid: false,
    productId: null,
    productIds: [],
    orderId: null,
    purchaseState: 2,
    acknowledgementState: 0,
    consumptionState: null,
    purchaseTimeMillis: null
  });

  const response = await verifyPlayEntitlementRequest(
    createRequest(
      {
        purchaseToken: "token",
        idempotencyKey: "idem_key_1234"
      },
      { authorization: "Bearer user-2" }
    ) as never,
    createContext() as never,
    createConfig()
  );

  assert.equal(response.status, 202);
  assert.equal((response.jsonBody as { pending: boolean }).pending, true);
});

test("verifyPlayEntitlementRequest persists entitlement for valid purchase", async () => {
  verifyPlayProductPurchaseMock.mockResolvedValue({
    isValid: true,
    productId: "pro_access",
    productIds: ["pro_access"],
    orderId: "order-1",
    purchaseState: 0,
    acknowledgementState: 0,
    consumptionState: null,
    purchaseTimeMillis: "1770000000000"
  });
  shouldAcknowledgePurchaseMock.mockReturnValue(true);

  const response = await verifyPlayEntitlementRequest(
    createRequest(
      {
        purchaseToken: "token",
        idempotencyKey: "idem_key_1234"
      },
      { authorization: "Bearer user-3" }
    ) as never,
    createContext() as never,
    createConfig()
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { hasProAccess: boolean }).hasProAccess, true);
  assert.equal(acknowledgePlayProductPurchaseMock.mock.calls.length, 1);
  assert.equal(upsertEntitlementMock.mock.calls.length, 1);
  assert.equal(upsertPlayPurchaseMock.mock.calls.length, 1);
  assert.equal(createPurchaseVerificationResultMock.mock.calls.length, 1);
});

test("verifyPlayEntitlementRequest returns 402 for invalid purchase", async () => {
  verifyPlayProductPurchaseMock.mockResolvedValue({
    isValid: false,
    productId: null,
    productIds: [],
    orderId: null,
    purchaseState: 0,
    acknowledgementState: 1,
    consumptionState: null,
    purchaseTimeMillis: null
  });

  const context = createContext();
  const response = await verifyPlayEntitlementRequest(
    createRequest(
      {
        purchaseToken: "token",
        idempotencyKey: "idem_key_1234"
      },
      { authorization: "Bearer user-4" }
    ) as never,
    context as never,
    createConfig()
  );

  assert.equal(response.status, 402);
  assert.equal(
    (response.jsonBody as { error: string }).error,
    "Google Play purchase is not valid."
  );
  assert.equal(context.warn.mock.calls.length > 0, true);
});
