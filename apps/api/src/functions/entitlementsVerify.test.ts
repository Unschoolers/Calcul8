import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  resolvePurchaseVerifierMock,
  getSupportedPurchaseProvidersMock,
  maybeHandleHttpGuardsMock,
  jsonResponseMock,
  errorResponseMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolvePurchaseVerifierMock: vi.fn(),
  getSupportedPurchaseProvidersMock: vi.fn(),
  maybeHandleHttpGuardsMock: vi.fn(),
  jsonResponseMock: vi.fn((request: unknown, config: unknown, status: number, body: unknown) => ({
    status,
    jsonBody: body
  })),
  errorResponseMock: vi.fn((request: unknown, config: unknown, error: unknown, message: string) => ({
    status: 500,
    jsonBody: { error: message }
  }))
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/http", () => ({
  maybeHandleHttpGuards: maybeHandleHttpGuardsMock,
  jsonResponse: jsonResponseMock,
  errorResponse: errorResponseMock
}));

vi.mock("./purchaseVerifiers", () => ({
  resolvePurchaseVerifier: resolvePurchaseVerifierMock,
  getSupportedPurchaseProviders: getSupportedPurchaseProvidersMock
}));

import { entitlementsVerify } from "./entitlementsVerify";

function createConfig(): ApiConfig {
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
    migrationRunsContainerId: "migration_runs"
  };
}

function createRequest(provider: string) {
  return {
    method: "POST",
    params: { provider },
    headers: {
      get() {
        return null;
      }
    }
  };
}

function createContext() {
  return {
    error: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  maybeHandleHttpGuardsMock.mockReturnValue(null);
  getSupportedPurchaseProvidersMock.mockReturnValue(["play", "stripe"]);
});

test("entitlementsVerify delegates to the resolved provider verifier", async () => {
  const verifierMock = vi.fn().mockResolvedValue({
    status: 202,
    jsonBody: { ok: true }
  });
  resolvePurchaseVerifierMock.mockReturnValue(verifierMock);

  const request = createRequest("PLAY");
  const context = createContext();
  const response = await entitlementsVerify(request as never, context as never);

  assert.equal(response.status, 202);
  assert.equal(verifierMock.mock.calls.length, 1);
  assert.equal(verifierMock.mock.calls[0]?.[3], "/entitlements/verify/{provider}");
});

test("entitlementsVerify returns a 501 response for unsupported providers", async () => {
  resolvePurchaseVerifierMock.mockReturnValue(null);

  const response = await entitlementsVerify(createRequest("unknown") as never, createContext() as never);

  assert.equal(response.status, 501);
  assert.deepEqual(response.jsonBody, {
    error: "Purchase provider 'unknown' is not supported.",
    supportedProviders: ["play", "stripe"]
  });
});
