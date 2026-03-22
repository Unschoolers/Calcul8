import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "./auth";
import type { ApiConfig, WhatnotImportRowDocument } from "../types";

const DEFAULT_IMPORT_SCOPES = ["read:orders"];
const DEFAULT_WHATNOT_AUTHORIZE_URL = "https://api.whatnot.com/oauth/authorize";
const DEFAULT_WHATNOT_TOKEN_URL = "https://api.whatnot.com/oauth/token";
const DEFAULT_WHATNOT_API_BASE_URL = "https://api.whatnot.com";
const ORDERS_QUERY = `
  query WhatnotOrders($first: Int!, $after: String, $filter: OrderFilterInput) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          status
          createdAt
          updatedAt
          shippingPrice {
            amount
            currencyCode
          }
          items(first: 1) {
            edges {
              node {
                id
                quantity
                price {
                  amount
                  currencyCode
                }
                subtotal {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

const ME_QUERY = `
  query WhatnotMe {
    me {
      id
      username
      displayName
    }
  }
`;

interface WhatnotTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface WhatnotGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface WhatnotOrdersQueryResponse {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    };
    edges?: Array<{
      node?: {
        id?: string;
        status?: string;
        createdAt?: string;
        updatedAt?: string;
        shippingPrice?: {
          amount?: number;
        };
        items?: {
          edges?: Array<{
            node?: {
              id?: string;
              quantity?: number;
              price?: {
                amount?: number;
              };
              subtotal?: {
                amount?: number;
              };
            };
          }>;
        };
      };
    }>;
  };
}

interface WhatnotMeResponse {
  me?: {
    id?: string;
    username?: string;
    displayName?: string;
  };
}

export interface WhatnotConnectionTokenPayload {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  scopes: string[];
}

export interface WhatnotSellerIdentity {
  externalAccountId: string;
  externalDisplayName: string;
}

export interface WhatnotOrdersPage {
  rows: WhatnotImportRowDocument[];
  nextCursor: string | null;
}

function normalizeUrl(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\/+$/, "");
}

function requireWhatnotConfigValue(value: string, label: string): string {
  if (!value) {
    throw new HttpError(503, `Whatnot integration is not configured (${label}).`);
  }
  return value;
}

function getWhatnotAuthorizeUrl(config: ApiConfig): string {
  return normalizeUrl(config.whatnotOauthAuthorizeUrl) || DEFAULT_WHATNOT_AUTHORIZE_URL;
}

function getWhatnotTokenUrl(config: ApiConfig): string {
  return normalizeUrl(config.whatnotOauthTokenUrl) || DEFAULT_WHATNOT_TOKEN_URL;
}

function getWhatnotGraphqlUrl(config: ApiConfig): string {
  const baseUrl = normalizeUrl(config.whatnotApiBaseUrl) || DEFAULT_WHATNOT_API_BASE_URL;
  return `${baseUrl}/graphql`;
}

function getWhatnotClientId(config: ApiConfig): string {
  return requireWhatnotConfigValue(String(config.whatnotClientId ?? "").trim(), "client id");
}

function getWhatnotClientSecret(config: ApiConfig): string {
  return requireWhatnotConfigValue(String(config.whatnotClientSecret ?? "").trim(), "client secret");
}

function getWhatnotRedirectUri(config: ApiConfig): string {
  return requireWhatnotConfigValue(String(config.whatnotRedirectUri ?? "").trim(), "redirect URI");
}

function getWhatnotAppReturnUrl(config: ApiConfig, preferredAppReturnUrl?: string): string {
  const explicitAppReturnUrl = String(preferredAppReturnUrl ?? "").trim();
  if (explicitAppReturnUrl) {
    return explicitAppReturnUrl;
  }

  const configuredAppReturnUrl = String(config.whatnotAppReturnUrl ?? "").trim();
  if (configuredAppReturnUrl) {
    return configuredAppReturnUrl;
  }

  try {
    return new URL("/", getWhatnotRedirectUri(config)).toString();
  } catch {
    return getWhatnotRedirectUri(config);
  }
}

function getWhatnotEncryptionKey(config: ApiConfig): Buffer {
  const secret = requireWhatnotConfigValue(
    String(config.whatnotTokenEncryptionSecret ?? "").trim(),
    "token encryption secret"
  );
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptTokenValue(config: ApiConfig, plaintext: string): string {
  const key = getWhatnotEncryptionKey(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${authTag.toString("base64url")}`;
}

function decryptTokenValue(config: ApiConfig, payload: string): string {
  const [version, ivRaw, ciphertextRaw, authTagRaw] = String(payload ?? "").trim().split(".");
  if (version !== "v1" || !ivRaw || !ciphertextRaw || !authTagRaw) {
    throw new HttpError(500, "Stored Whatnot token format is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getWhatnotEncryptionKey(config),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function encryptWhatnotTokenPayload(
  config: ApiConfig,
  tokenResponse: WhatnotTokenResponse
): WhatnotConnectionTokenPayload {
  const accessToken = String(tokenResponse.access_token ?? "").trim();
  const refreshToken = String(tokenResponse.refresh_token ?? "").trim();
  if (!accessToken || !refreshToken) {
    throw new HttpError(502, "Whatnot token response was missing required tokens.");
  }

  const expiresInSeconds = Math.max(0, Math.floor(Number(tokenResponse.expires_in) || 0));
  const tokenExpiresAt = new Date(Date.now() + (expiresInSeconds * 1000)).toISOString();
  const scopes = String(tokenResponse.scope ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return {
    accessToken: encryptTokenValue(config, accessToken),
    refreshToken: encryptTokenValue(config, refreshToken),
    tokenExpiresAt,
    scopes
  };
}

export function decryptWhatnotAccessToken(config: ApiConfig, ciphertext: string): string {
  return decryptTokenValue(config, ciphertext);
}

export function decryptWhatnotRefreshToken(config: ApiConfig, ciphertext: string): string {
  return decryptTokenValue(config, ciphertext);
}

export function buildWhatnotAuthorizeUrl(config: ApiConfig, state: string, scopes = DEFAULT_IMPORT_SCOPES): string {
  const url = new URL(getWhatnotAuthorizeUrl(config));
  url.searchParams.set("client_id", getWhatnotClientId(config));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getWhatnotRedirectUri(config));
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function requestWhatnotToken(
  config: ApiConfig,
  params: Record<string, string>
): Promise<WhatnotTokenResponse> {
  const body = new URLSearchParams({
    client_id: getWhatnotClientId(config),
    client_secret: getWhatnotClientSecret(config),
    ...params
  });
  const response = await fetch(getWhatnotTokenUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : response.status, "Whatnot token exchange failed.");
  }

  return (await response.json()) as WhatnotTokenResponse;
}

export async function exchangeWhatnotAuthorizationCode(
  config: ApiConfig,
  code: string
): Promise<WhatnotConnectionTokenPayload> {
  const tokenResponse = await requestWhatnotToken(config, {
    grant_type: "authorization_code",
    code: String(code ?? "").trim(),
    redirect_uri: getWhatnotRedirectUri(config)
  });
  return encryptWhatnotTokenPayload(config, tokenResponse);
}

export async function refreshWhatnotAccessToken(
  config: ApiConfig,
  refreshTokenCiphertext: string
): Promise<WhatnotConnectionTokenPayload> {
  const tokenResponse = await requestWhatnotToken(config, {
    grant_type: "refresh_token",
    refresh_token: decryptWhatnotRefreshToken(config, refreshTokenCiphertext)
  });
  return encryptWhatnotTokenPayload(config, tokenResponse);
}

async function fetchWhatnotGraphql<T>(
  config: ApiConfig,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(getWhatnotGraphqlUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : response.status, "Whatnot API request failed.");
  }

  const payload = (await response.json()) as WhatnotGraphqlResponse<T>;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const message = String(payload.errors[0]?.message ?? "Whatnot API request failed.").trim();
    throw new HttpError(502, message || "Whatnot API request failed.");
  }
  if (!payload.data) {
    throw new HttpError(502, "Whatnot API response was missing data.");
  }

  return payload.data;
}

export async function fetchWhatnotSellerIdentity(
  config: ApiConfig,
  accessTokenCiphertext: string
): Promise<WhatnotSellerIdentity> {
  const accessToken = decryptWhatnotAccessToken(config, accessTokenCiphertext);
  const payload = await fetchWhatnotGraphql<WhatnotMeResponse>(config, accessToken, ME_QUERY);
  const user = payload.me;
  const externalAccountId = String(user?.id ?? "").trim();
  if (!externalAccountId) {
    throw new HttpError(502, "Whatnot identity response was missing the seller account id.");
  }

  return {
    externalAccountId,
    externalDisplayName: String(user?.displayName ?? user?.username ?? externalAccountId).trim()
  };
}

function toCurrencyAmountDollars(value: unknown): number {
  const amountCents = Number(value);
  if (!Number.isFinite(amountCents)) return 0;
  return amountCents / 100;
}

function toDateOnly(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function normalizeMatchLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildWhatnotImportFingerprint(input: {
  externalOrderId: string;
  externalOrderItemId: string;
  quantity: number;
  price: number;
  buyerShipping: number;
  date: string;
  orderStatus: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
}

export function hashWhatnotExternalSaleKey(
  externalAccountId: string,
  externalOrderId: string,
  externalOrderItemId: string
): string {
  return createHash("sha256")
    .update(`whatnot:${externalAccountId}:${externalOrderId}:${externalOrderItemId}`, "utf8")
    .digest("hex");
}

export function hashWhatnotMatchKey(key: string): string {
  return createHash("sha256")
    .update(`whatnot_match:${normalizeMatchLabel(key)}`, "utf8")
    .digest("hex");
}

export function buildWhatnotRememberedMatchKeys(row: Pick<
  WhatnotImportRowDocument,
  "title" | "sku" | "listingId" | "productId" | "variantId"
>): string[] {
  const keys: string[] = [];
  const addKey = (prefix: string, value: unknown): void => {
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue) return;
    keys.push(`${prefix}:${normalizedValue}`);
  };

  addKey("listing", row.listingId);
  addKey("product", row.productId);
  addKey("variant", row.variantId);
  addKey("sku", row.sku);
  const normalizedTitle = normalizeMatchLabel(String(row.title ?? ""));
  if (normalizedTitle) {
    keys.push(`title:${normalizedTitle}`);
  }

  return [...new Set(keys)];
}

export function isWhatnotRowLikelyRtyh(row: Pick<WhatnotImportRowDocument, "title">): boolean {
  const normalizedTitle = normalizeMatchLabel(String(row.title ?? ""));
  if (!normalizedTitle) return false;
  return ["rtyh", "spot", "roulette", "wheel", "pick"].some((token) => normalizedTitle.includes(token));
}

export async function fetchWhatnotOrdersPage(
  config: ApiConfig,
  accessTokenCiphertext: string,
  externalAccountId: string,
  input: {
    createdAtGte: string;
    after?: string | null;
  }
): Promise<WhatnotOrdersPage> {
  const accessToken = decryptWhatnotAccessToken(config, accessTokenCiphertext);
  const payload = await fetchWhatnotGraphql<WhatnotOrdersQueryResponse>(config, accessToken, ORDERS_QUERY, {
    first: 50,
    after: input.after ?? null,
    filter: {
      createdAt: {
        gte: input.createdAtGte
      }
    }
  });

  const rows: WhatnotImportRowDocument[] = [];
  for (const edge of payload.orders?.edges ?? []) {
    const order = edge?.node;
    const orderId = String(order?.id ?? "").trim();
    const orderItem = order?.items?.edges?.[0]?.node;
    const orderItemId = String(orderItem?.id ?? "").trim();
    if (!orderId || !orderItemId) continue;

    const quantity = Math.max(1, Math.floor(Number(orderItem?.quantity) || 1));
    const price = toCurrencyAmountDollars(
      orderItem?.subtotal?.amount ?? orderItem?.price?.amount ?? 0
    );
    const buyerShipping = toCurrencyAmountDollars(order?.shippingPrice?.amount ?? 0);
    const date = toDateOnly(order?.createdAt);
    const orderStatus = String(order?.status ?? "CREATED").trim() || "CREATED";
    const title = `Order item ${orderItemId.slice(-8)}`;
    const payloadFingerprint = buildWhatnotImportFingerprint({
      externalOrderId: orderId,
      externalOrderItemId: orderItemId,
      quantity,
      price,
      buyerShipping,
      date,
      orderStatus
    });

    rows.push({
      rowId: orderItemId,
      externalSaleId: `${orderId}:${orderItemId}`,
      externalOrderId: orderId,
      externalOrderItemId: orderItemId,
      externalAccountId,
      title,
      quantity,
      price,
      buyerShipping,
      date,
      orderStatus,
      payloadFingerprint,
      action: "create",
      matchSource: "none",
      requiresManualReview: true
    });
  }

  return {
    rows,
    nextCursor: String(payload.orders?.pageInfo?.endCursor ?? "").trim() || null
  };
}

export function resolveWhatnotAppCallbackUrl(
  config: ApiConfig,
  outcome: "connected" | "error",
  scopeType: "user" | "workspace",
  message?: string,
  appReturnUrl?: string
): string {
  const url = new URL(getWhatnotAppReturnUrl(config, appReturnUrl));
  url.searchParams.set("whatnot", outcome);
  url.searchParams.set("whatnotScope", scopeType === "workspace" ? "workspace" : "personal");
  if (message) {
    url.searchParams.set("whatnotMessage", message);
  }
  return url.toString();
}
