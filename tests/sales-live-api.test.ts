import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  buildAuthenticatedHeadersMock,
  getStoredGoogleIdTokenMock,
  fetchAuthenticatedApiResponseMock,
  handleExpiredAuthMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  buildAuthenticatedHeadersMock: vi.fn(),
  getStoredGoogleIdTokenMock: vi.fn(),
  fetchAuthenticatedApiResponseMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/auth/index.ts", () => ({
  buildAuthenticatedHeaders: buildAuthenticatedHeadersMock,
  getStoredGoogleIdToken: getStoredGoogleIdTokenMock
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  fetchAuthenticatedApiResponse: fetchAuthenticatedApiResponseMock,
  handleExpiredAuth: handleExpiredAuthMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import {
  SalesLiveApiError,
  cacheAuthoritativeSales,
  canUseAuthoritativeSalesLiveApi,
  createMutationId,
  deleteAuthoritativeSale,
  fetchAuthoritativeLivePricing,
  fetchAuthoritativeSales,
  fetchWorkspaceRealtimeSubscribeToken,
  saveAuthoritativeLivePricing,
  saveAuthoritativeSale
} from "../src/app-core/methods/sales-live-api.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
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
}

function createApp(overrides: Record<string, unknown> = {}) {
  return {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    getSalesStorageKey: (lotId: number) => `sales:${lotId}`,
    googleAuthEpoch: 0,
    hasProAccess: false,
    notify: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMockStorage());
  vi.stubGlobal("window", {
    crypto: {
      randomUUID: vi.fn(() => "uuid-123")
    }
  });
  buildAuthenticatedHeadersMock.mockImplementation((_mode: string, headers?: Record<string, string>) => ({
    ...(headers ?? {})
  }));
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  getStoredGoogleIdTokenMock.mockReturnValue("google-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("canUseAuthoritativeSalesLiveApi requires both api base URL and bootstrap token", () => {
  resolveApiBaseUrlMock.mockReturnValue("");
  assert.equal(canUseAuthoritativeSalesLiveApi(), false);

  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  getStoredGoogleIdTokenMock.mockReturnValue("");
  assert.equal(canUseAuthoritativeSalesLiveApi(), false);

  getStoredGoogleIdTokenMock.mockReturnValue("google-token");
  assert.equal(canUseAuthoritativeSalesLiveApi(), true);
});

test("fetchAuthoritativeSales returns null without signed-in entity API access", async () => {
  getStoredGoogleIdTokenMock.mockReturnValue("");

  const sales = await fetchAuthoritativeSales(createApp(), 7);

  assert.equal(sales, null);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 0);
});

test("fetchAuthoritativeSales normalizes API payload, scopes workspace requests, and caches sales", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValue(new Response(JSON.stringify({
    sales: [
      {
        id: 11,
        type: "box",
        quantity: "3.9",
        packsCount: "2",
        price: "40.25",
        buyerShipping: "4.5",
        date: "2026-03-17",
        version: "8",
        updatedAt: "2026-03-17T12:00:00Z",
        updatedBy: "user-1",
        mutationId: "mut-1",
        singlesItems: [
          { singlesPurchaseEntryId: "9", quantity: "2", price: "1.75" },
          { singlesPurchaseEntryId: "bad", quantity: "0", price: "5" },
          null
        ]
      },
      {
        id: "bad"
      }
    ]
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const app = createApp({
    activeScopeType: "workspace",
    activeWorkspaceId: "team-1"
  });
  const sales = await fetchAuthoritativeSales(app, 42);

  assert.deepEqual(sales, [
    {
      id: 11,
      type: "box",
      quantity: 3,
      packsCount: 2,
      singlesPurchaseEntryId: undefined,
      singlesItems: [
        {
          singlesPurchaseEntryId: 9,
          quantity: 2,
          price: 1.75
        }
      ],
      price: 40.25,
      priceIsTotal: undefined,
      memo: undefined,
      buyerShipping: 4.5,
      date: "2026-03-17",
      version: 8,
      updatedAt: "2026-03-17T12:00:00Z",
      updatedBy: "user-1",
      mutationId: "mut-1"
    }
  ]);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 1);
  assert.equal(
    fetchAuthenticatedApiResponseMock.mock.calls[0]?.[1],
    "/lots/42/sales?workspaceId=team-1"
  );
  assert.equal(localStorage.getItem("sales:42"), JSON.stringify(sales));
});

test("requestJson surfaces API message bodies and requests default 401 auth expiry", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    message: "sign in again"
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const app = createApp();
  await assert.rejects(
    () => fetchAuthoritativeSales(app, 9),
    (error: unknown) => {
      assert.ok(error instanceof SalesLiveApiError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Your sign-in expired. Please sign in again.");
      return true;
    }
  );
  assert.deepEqual(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[3], {});

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    error: "Lot sync conflict"
  }), {
    status: 409,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  await assert.rejects(
    () => fetchAuthoritativeLivePricing(app, 9),
    (error: unknown) => {
      assert.ok(error instanceof SalesLiveApiError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "Lot sync conflict");
      return true;
    }
  );
});

test("entity API helpers fail cleanly when api base URL is missing or response JSON is empty", async () => {
  resolveApiBaseUrlMock.mockReturnValue("");

  await assert.rejects(
    () => saveAuthoritativeSale(createApp(), 4, {
      id: 1,
      type: "pack",
      quantity: 1,
      packsCount: 0,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17"
    }, 0),
    (error: unknown) => {
      assert.ok(error instanceof SalesLiveApiError);
      assert.equal(error.status, 0);
      assert.equal(error.message, "API base URL is not configured.");
      return true;
    }
  );

  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response("", {
    status: 200
  }));
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response("", {
    status: 200
  }));

  const sales = await fetchAuthoritativeSales(createApp(), 1);
  const livePricing = await fetchAuthoritativeLivePricing(createApp(), 1);

  assert.deepEqual(sales, []);
  assert.equal(livePricing, null);
});

test("saveAuthoritativeSale sends session-preferred headers and rejects invalid responses", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    sale: {
      id: 5,
      type: "pack",
      quantity: 1,
      packsCount: 0,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17",
      version: 2
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const app = createApp({
    activeScopeType: "workspace",
    activeWorkspaceId: "shared-2"
  });
  const sale = await saveAuthoritativeSale(app, 4, {
    id: 5,
    type: "pack",
    quantity: 1,
    packsCount: 0,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-17"
  }, 1);

  assert.equal(sale.version, 2);
  const requestInit = fetchAuthenticatedApiResponseMock.mock.calls[0]?.[2] as RequestInit;
  assert.equal(requestInit.method, "POST");
  const parsedBody = JSON.parse(String(requestInit.body));
  assert.equal(parsedBody.workspaceId, "shared-2");
  assert.equal(parsedBody.baseVersion, 1);
  assert.match(parsedBody.mutationId, /^sale:/);

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    sale: {
      id: "bad"
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  await assert.rejects(
    () => saveAuthoritativeSale(app, 4, {
      id: 6,
      type: "pack",
      quantity: 1,
      packsCount: 0,
      price: 20,
      buyerShipping: 0,
      date: "2026-03-17"
    }, 0),
    (error: unknown) => {
      assert.ok(error instanceof SalesLiveApiError);
      assert.equal(error.status, 500);
      assert.equal(error.message, "Sale saved, but the API response was invalid.");
      return true;
    }
  );
});

test("deleteAuthoritativeSale includes mutation and workspace body", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValue(new Response("{}", {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  await deleteAuthoritativeSale(createApp({
    activeScopeType: "workspace",
    activeWorkspaceId: "alpha"
  }), 13, 99, 7);

  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls.length, 1);
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[1], "/lots/13/sales/99");
  const requestInit = fetchAuthenticatedApiResponseMock.mock.calls[0]?.[2] as RequestInit;
  const parsedBody = JSON.parse(String(requestInit.body));
  assert.equal(parsedBody.workspaceId, "alpha");
  assert.equal(parsedBody.baseVersion, 7);
  assert.match(parsedBody.mutationId, /^sale-delete:/);
});

test("fetchAuthoritativeLivePricing normalizes payload and saveAuthoritativeLivePricing sends current version", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    livePricing: {
      livePackPrice: "3.5",
      liveBoxPriceSell: "120",
      liveSpotPrice: "0",
      version: "4",
      updatedAt: "2026-03-17T09:00:00Z",
      updatedBy: "user-2",
      mutationId: "live-1"
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const livePricing = await fetchAuthoritativeLivePricing(createApp(), 6);
  assert.deepEqual(livePricing, {
    livePackPrice: 3.5,
    liveBoxPriceSell: 120,
    liveSpotPrice: 0,
    version: 4,
    updatedAt: "2026-03-17T09:00:00Z",
    updatedBy: "user-2",
    mutationId: "live-1"
  });

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    livePricing: {
      livePackPrice: 5,
      liveBoxPriceSell: 150,
      liveSpotPrice: 2,
      version: 5
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const saved = await saveAuthoritativeLivePricing(createApp({
    activeScopeType: "workspace",
    activeWorkspaceId: "beta"
  }), 6, {
    livePackPrice: 5,
    liveBoxPriceSell: 150,
    liveSpotPrice: 2,
    currentLivePricingVersion: 4
  });
  assert.equal(saved.version, 5);
  const requestInit = fetchAuthenticatedApiResponseMock.mock.calls[1]?.[2] as RequestInit;
  const parsedBody = JSON.parse(String(requestInit.body));
  assert.equal(parsedBody.workspaceId, "beta");
  assert.equal(parsedBody.baseVersion, 4);
  assert.match(parsedBody.mutationId, /^live-pricing:/);
});

test("fetchWorkspaceRealtimeSubscribeToken requests a workspace-scoped token", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    room: "workspace:beta:lot:6",
    token: "signed-token",
    expiresAt: 1760000000
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const tokenPayload = await fetchWorkspaceRealtimeSubscribeToken(createApp({
    activeScopeType: "workspace",
    activeWorkspaceId: "beta"
  }), 6);

  assert.deepEqual(tokenPayload, {
    room: "workspace:beta:lot:6",
    rooms: ["workspace:beta:lot:6"],
    token: "signed-token",
    expiresAt: 1760000000
  });
  assert.equal(
    fetchAuthenticatedApiResponseMock.mock.calls[0]?.[1],
    "/lots/6/realtime-token?workspaceId=beta"
  );
});

test("fetchWorkspaceRealtimeSubscribeToken does not expire auth on 401", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({
    message: "token failed"
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const app = createApp({
    activeScopeType: "workspace",
    activeWorkspaceId: "beta"
  });

  await assert.rejects(
    () => fetchWorkspaceRealtimeSubscribeToken(app, 6),
    (error: unknown) => {
      assert.ok(error instanceof SalesLiveApiError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Your sign-in expired. Please sign in again.");
      return true;
    }
  );

  assert.equal(handleExpiredAuthMock.mock.calls.length, 0);
});

test("saveAuthoritativeLivePricing rejects invalid response payloads", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValue(new Response(JSON.stringify({
    livePricing: []
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  await assert.rejects(
    () => saveAuthoritativeLivePricing(createApp(), 3, {
      livePackPrice: 1,
      liveBoxPriceSell: 2,
      liveSpotPrice: 3,
      currentLivePricingVersion: null
    }),
    (error: unknown) => {
      assert.ok(error instanceof SalesLiveApiError);
      assert.equal(error.status, 500);
      assert.equal(error.message, "Live pricing saved, but the API response was invalid.");
      return true;
    }
  );
});

test("createMutationId uses crypto when available and falls back otherwise", () => {
  const cryptoMutationId = createMutationId("sale");
  assert.equal(cryptoMutationId, "sale:uuid-123");

  vi.stubGlobal("window", {
    crypto: {}
  });
  const fallbackMutationId = createMutationId("sale");
  assert.match(fallbackMutationId, /^sale:\d+:[0-9a-f]+$/);
});

test("cacheAuthoritativeSales ignores storage failures", () => {
  const setItem = vi.fn(() => {
    throw new Error("quota");
  });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    setItem,
    removeItem: vi.fn(),
    clear: vi.fn()
  });

  cacheAuthoritativeSales(createApp(), 12, [{
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 0,
    price: 1,
    buyerShipping: 0,
    date: "2026-03-17"
  }]);

  assert.equal(setItem.mock.calls.length, 1);
});
