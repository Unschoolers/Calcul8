import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import { createApiConfig } from "../test-support/function-test-helpers";
import {
  buildWhatnotAuthorizeUrl,
  buildWhatnotImportRowFromNormalizedInput,
  buildWhatnotRememberedMatchKeys,
  decryptWhatnotAccessToken,
  decryptWhatnotRefreshToken,
  encryptWhatnotTokenPayload,
  exchangeWhatnotAuthorizationCode,
  fetchWhatnotOrdersPage,
  fetchWhatnotSellerIdentity,
  hashWhatnotExternalSaleKey,
  hashWhatnotMatchKey,
  isWhatnotRowLikelyRtyh,
  refreshWhatnotAccessToken,
  resolveWhatnotAppCallbackUrl
} from "./whatnot";

function createWhatnotConfig(overrides = {}) {
  return createApiConfig({
    whatnotClientId: "client-1",
    whatnotClientSecret: "secret-1",
    whatnotRedirectUri: "https://api.example.test/whatnot/callback",
    whatnotAppReturnUrl: "https://app.example.test/settings",
    whatnotOauthAuthorizeUrl: "https://whatnot.example.test/oauth/authorize/",
    whatnotOauthTokenUrl: "https://whatnot.example.test/oauth/token/",
    whatnotApiBaseUrl: "https://whatnot.example.test/",
    whatnotTokenEncryptionSecret: "test-encryption-secret",
    ...overrides
  });
}

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

function toExpectedLocalDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("encryptWhatnotTokenPayload encrypts required tokens and normalizes scopes", () => {
  const config = createWhatnotConfig();

  const encrypted = encryptWhatnotTokenPayload(config, {
    access_token: " access-token ",
    refresh_token: " refresh-token ",
    expires_in: 3600,
    scope: "read:orders  read:seller"
  });

  assert.notEqual(encrypted.accessToken, "access-token");
  assert.notEqual(encrypted.refreshToken, "refresh-token");
  assert.equal(decryptWhatnotAccessToken(config, encrypted.accessToken), "access-token");
  assert.equal(decryptWhatnotRefreshToken(config, encrypted.refreshToken), "refresh-token");
  assert.deepEqual(encrypted.scopes, ["read:orders", "read:seller"]);
  assert.equal(Number.isNaN(Date.parse(encrypted.tokenExpiresAt)), false);
});

test("encryptWhatnotTokenPayload rejects missing token data and invalid stored token formats", () => {
  const config = createWhatnotConfig();

  assert.throws(
    () => encryptWhatnotTokenPayload(config, {
      access_token: "",
      refresh_token: "refresh-token"
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "Whatnot token response was missing required tokens."
  );
  assert.throws(
    () => decryptWhatnotAccessToken(config, "legacy-token"),
    (error: { status?: number; message?: string }) =>
      error.status === 500 && error.message === "Stored Whatnot token format is invalid."
  );
});

test("buildWhatnotAuthorizeUrl uses configured OAuth URLs and requested scopes", () => {
  const url = new URL(buildWhatnotAuthorizeUrl(createWhatnotConfig(), "state-1", ["read:orders", "read:seller"]));

  assert.equal(url.toString().startsWith("https://whatnot.example.test/oauth/authorize?"), true);
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), "https://api.example.test/whatnot/callback");
  assert.equal(url.searchParams.get("scope"), "read:orders read:seller");
  assert.equal(url.searchParams.get("state"), "state-1");
});

test("exchangeWhatnotAuthorizationCode posts the OAuth exchange and encrypts the response", async () => {
  fetchMock.mockResolvedValue(createJsonResponse({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 120,
    scope: "read:orders"
  }));

  const config = createWhatnotConfig();
  const tokenPayload = await exchangeWhatnotAuthorizationCode(config, " code-1 ");

  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(fetchMock.mock.calls[0]?.[0], "https://whatnot.example.test/oauth/token");
  const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
  const params = requestInit.body as URLSearchParams;
  assert.equal(params.get("client_id"), "client-1");
  assert.equal(params.get("client_secret"), "secret-1");
  assert.equal(params.get("grant_type"), "authorization_code");
  assert.equal(params.get("code"), "code-1");
  assert.equal(params.get("redirect_uri"), "https://api.example.test/whatnot/callback");
  assert.equal(decryptWhatnotAccessToken(config, tokenPayload.accessToken), "access-token");
  assert.deepEqual(tokenPayload.scopes, ["read:orders"]);
});

test("refreshWhatnotAccessToken decrypts refresh tokens before requesting a new token", async () => {
  const config = createWhatnotConfig();
  const encrypted = encryptWhatnotTokenPayload(config, {
    access_token: "old-access-token",
    refresh_token: "refresh-token",
    expires_in: 1,
    scope: "read:orders"
  });
  fetchMock.mockResolvedValue(createJsonResponse({
    access_token: "new-access-token",
    refresh_token: "new-refresh-token",
    expires_in: 120,
    scope: "read:orders"
  }));

  const refreshed = await refreshWhatnotAccessToken(config, encrypted.refreshToken);

  const params = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
  assert.equal(params.get("grant_type"), "refresh_token");
  assert.equal(params.get("refresh_token"), "refresh-token");
  assert.equal(decryptWhatnotAccessToken(config, refreshed.accessToken), "new-access-token");
});

test("exchangeWhatnotAuthorizationCode maps Whatnot token failures to upstream errors", async () => {
  fetchMock.mockResolvedValue(createJsonResponse({ error: "bad grant" }, { status: 400 }));

  await assert.rejects(
    () => exchangeWhatnotAuthorizationCode(createWhatnotConfig(), "code-1"),
    (error: { status?: number; message?: string }) =>
      error.status === 400 && error.message === "Whatnot token exchange failed."
  );

  fetchMock.mockResolvedValue(createJsonResponse({ error: "upstream unavailable" }, { status: 503 }));
  await assert.rejects(
    () => exchangeWhatnotAuthorizationCode(createWhatnotConfig(), "code-1"),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "Whatnot token exchange failed."
  );
});

test("fetchWhatnotSellerIdentity decrypts access tokens and falls back to username display names", async () => {
  const config = createWhatnotConfig();
  const encrypted = encryptWhatnotTokenPayload(config, {
    access_token: "access-token",
    refresh_token: "refresh-token"
  });
  fetchMock.mockResolvedValue(createJsonResponse({
    data: {
      me: {
        id: "seller-1",
        username: "seller_username"
      }
    }
  }));

  const identity = await fetchWhatnotSellerIdentity(config, encrypted.accessToken);

  assert.equal(identity.externalAccountId, "seller-1");
  assert.equal(identity.externalDisplayName, "seller_username");
  assert.equal(fetchMock.mock.calls[0]?.[0], "https://whatnot.example.test/graphql");
  const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
  assert.equal((requestInit.headers as Record<string, string>).Authorization, "Bearer access-token");
  assert.match(String(requestInit.body), /WhatnotMe/);
});

test("fetchWhatnotSellerIdentity surfaces GraphQL errors and missing seller ids", async () => {
  const config = createWhatnotConfig();
  const encrypted = encryptWhatnotTokenPayload(config, {
    access_token: "access-token",
    refresh_token: "refresh-token"
  });

  fetchMock.mockResolvedValue(createJsonResponse({
    errors: [{ message: "permission denied" }]
  }));
  await assert.rejects(
    () => fetchWhatnotSellerIdentity(config, encrypted.accessToken),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "permission denied"
  );

  fetchMock.mockResolvedValue(createJsonResponse({
    data: {
      me: {
        username: "seller_username"
      }
    }
  }));
  await assert.rejects(
    () => fetchWhatnotSellerIdentity(config, encrypted.accessToken),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "Whatnot identity response was missing the seller account id."
  );
});

test("fetchWhatnotOrdersPage skips malformed edges and normalizes order item rows", async () => {
  const config = createWhatnotConfig();
  const encrypted = encryptWhatnotTokenPayload(config, {
    access_token: "access-token",
    refresh_token: "refresh-token"
  });
  fetchMock.mockResolvedValue(createJsonResponse({
    data: {
      orders: {
        pageInfo: {
          endCursor: "cursor-2"
        },
        edges: [
          { node: { id: "", items: { edges: [{ node: { id: "item-missing-order" } }] } } },
          { node: { id: "order-missing-item", items: { edges: [{ node: { id: "" } }] } } },
          {
            node: {
              id: "order-1",
              status: "",
              createdAt: "bad-date-value",
              shippingPrice: {
                amount: 250
              },
              items: {
                edges: [{
                  node: {
                    id: "item-123456789",
                    quantity: 2.9,
                    price: {
                      amount: 500
                    },
                    subtotal: {
                      amount: 1200
                    }
                  }
                }]
              }
            }
          }
        ]
      }
    }
  }));

  const page = await fetchWhatnotOrdersPage(config, encrypted.accessToken, "seller-1", {
    createdAtGte: "2026-03-01T00:00:00.000Z",
    after: "cursor-1"
  });

  assert.equal(page.rows.length, 1);
  assert.equal(page.nextCursor, "cursor-2");
  assert.equal(page.rows[0]?.externalSaleId, "order-1:item-123456789");
  assert.equal(page.rows[0]?.title, "Order item 23456789");
  assert.equal(page.rows[0]?.quantity, 2);
  assert.equal(page.rows[0]?.price, 12);
  assert.equal(page.rows[0]?.originalItemPrice, 5);
  assert.equal(page.rows[0]?.buyerShipping, 2.5);
  assert.equal(page.rows[0]?.date, "bad-date-v");
  assert.equal(page.rows[0]?.orderStatus, "CREATED");

  const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
  assert.deepEqual(requestBody.variables, {
    first: 50,
    after: "cursor-1",
    filter: {
      createdAt: {
        gte: "2026-03-01T00:00:00.000Z"
      }
    }
  });
});

test("buildWhatnotImportRowFromNormalizedInput rejects required field and money validation failures", () => {
  const validRow = {
    externalOrderId: "order-1",
    externalOrderItemId: "item-1",
    externalAccountId: "seller-1",
    title: "Kaiju #8",
    quantity: 1,
    price: 20,
    buyerShipping: 5,
    date: "2026-03-01"
  };

  assert.throws(
    () => buildWhatnotImportRowFromNormalizedInput({ ...validRow, externalOrderId: "" }),
    /Whatnot import row is missing 'externalOrderId'\./
  );
  assert.throws(
    () => buildWhatnotImportRowFromNormalizedInput({ ...validRow, externalOrderItemId: "" }),
    /Whatnot import row is missing 'externalOrderItemId'\./
  );
  assert.throws(
    () => buildWhatnotImportRowFromNormalizedInput({ ...validRow, externalAccountId: "" }),
    /Whatnot import row is missing 'externalAccountId'\./
  );
  assert.throws(
    () => buildWhatnotImportRowFromNormalizedInput({ ...validRow, title: "" }),
    /Whatnot import row is missing 'title'\./
  );
  assert.throws(
    () => buildWhatnotImportRowFromNormalizedInput({ ...validRow, price: -1 }),
    /Whatnot import row has invalid 'price'\./
  );
  assert.throws(
    () => buildWhatnotImportRowFromNormalizedInput({ ...validRow, buyerShipping: -1 }),
    /Whatnot import row has invalid 'buyerShipping'\./
  );
});

test("Whatnot matching helpers normalize remembered keys and RTYH titles", () => {
  const keys = buildWhatnotRememberedMatchKeys({
    title: " Kaiju #8 Spot ",
    sku: "",
    productCategory: " Singles ",
    listingId: "listing-1",
    productId: "product-1",
    variantId: "variant-1"
  });

  assert.deepEqual(keys, [
    "listing:listing-1",
    "product:product-1",
    "variant:variant-1",
    "title-category:kaiju 8 spot::singles",
    "title:kaiju 8 spot"
  ]);
  assert.equal(isWhatnotRowLikelyRtyh({ title: "Choose your wheel spot" }), true);
  assert.equal(isWhatnotRowLikelyRtyh({ title: "Single card" }), false);
  assert.equal(hashWhatnotMatchKey("Kaiju #8"), hashWhatnotMatchKey("kaiju 8"));
  assert.notEqual(
    hashWhatnotExternalSaleKey("seller-1", "order-1", "item-1"),
    hashWhatnotExternalSaleKey("seller-1", "order-1", "item-2")
  );
});

test("resolveWhatnotAppCallbackUrl falls back to redirect origin and encodes optional messages", () => {
  const connectedUrl = new URL(resolveWhatnotAppCallbackUrl(
    createWhatnotConfig({ whatnotAppReturnUrl: "" }),
    "connected",
    "workspace",
    "Connected",
    ""
  ));

  assert.equal(connectedUrl.origin, "https://api.example.test");
  assert.equal(connectedUrl.pathname, "/");
  assert.equal(connectedUrl.searchParams.get("whatnot"), "connected");
  assert.equal(connectedUrl.searchParams.get("whatnotScope"), "workspace");
  assert.equal(connectedUrl.searchParams.get("whatnotMessage"), "Connected");

  const errorUrl = new URL(resolveWhatnotAppCallbackUrl(
    createWhatnotConfig(),
    "error",
    "user",
    undefined,
    "https://app.example.test/custom"
  ));
  assert.equal(errorUrl.toString(), "https://app.example.test/custom?whatnot=error&whatnotScope=personal");
});

test("buildWhatnotImportRowFromNormalizedInput preserves enriched Whatnot metadata", () => {
  const row = buildWhatnotImportRowFromNormalizedInput({
    externalSaleId: "sale-1",
    externalOrderId: "order-1",
    externalOrderItemId: "item-1",
    externalAccountId: "seller-1",
    title: "Kaiju #8",
    listingTitle: "Kaiju #8 Listing",
    sku: "SKU-1",
    productCategory: "Singles",
    buyerName: "Buyer One",
    quantity: 2,
    price: 20,
    originalItemPrice: 11,
    buyerShipping: 5,
    date: "2026-03-01T14:00:00.000Z",
    orderPlacedAt: "2026-03-01T12:00:00.000Z",
    orderStatus: "COMPLETED",
    listingId: "listing-1",
    productId: "product-1",
    variantId: "variant-1"
  });

  assert.equal(row.listingTitle, "Kaiju #8 Listing");
  assert.equal(row.buyerName, "Buyer One");
  assert.equal(row.originalItemPrice, 11);
  assert.equal(row.orderPlacedAt, "2026-03-01T12:00:00.000Z");
  assert.equal(row.date, "2026-03-01");
});

test("buildWhatnotImportRowFromNormalizedInput normalizes UTC timestamps to the local calendar date", () => {
  const utcTimestamp = "2026-03-08T00:30:00.000Z";
  const row = buildWhatnotImportRowFromNormalizedInput({
    externalSaleId: "sale-2",
    externalOrderId: "order-2",
    externalOrderItemId: "item-2",
    externalAccountId: "seller-1",
    title: "Bleach vol2 box",
    quantity: 1,
    price: 82,
    buyerShipping: 0,
    date: utcTimestamp,
    orderPlacedAt: utcTimestamp
  });

  assert.equal(row.date, toExpectedLocalDate(utcTimestamp));
});
