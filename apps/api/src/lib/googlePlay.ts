import { createSign } from "node:crypto";
import { HttpError } from "./auth";
import type { ApiConfig } from "../types";
import { fetchWithRetry } from "./retry";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

interface VerifyPlayPurchaseInput {
  packageName: string;
  purchaseToken: string;
  allowedProductIds: string[];
}

interface AcknowledgePlayPurchaseInput {
  packageName: string;
  productId: string;
  purchaseToken: string;
}

export interface VerifyPlayPurchaseResult {
  isValid: boolean;
  productId: string | null;
  productIds: string[];
  orderId: string | null;
  purchaseState: number | null;
  acknowledgementState: number | null;
  consumptionState: number | null;
  purchaseTimeMillis: string | null;
}

interface GooglePlayProductsV2PurchaseStateContext {
  purchaseState?: string;
}

interface GooglePlayProductsV2ProductOfferDetails {
  productId?: string;
}

interface GooglePlayProductsV2ProductLineItem {
  productOfferDetails?: GooglePlayProductsV2ProductOfferDetails;
  productId?: string;
}

interface GooglePlayProductsV2Response {
  productLineItem?: GooglePlayProductsV2ProductLineItem[];
  purchaseStateContext?: GooglePlayProductsV2PurchaseStateContext;
  orderId?: string;
  purchaseCompletionTime?: string;
  acknowledgementState?: string;
}

interface NormalizedProductsV2Purchase {
  isValid: boolean;
  productIds: string[];
  orderId: string | null;
  purchaseState: number | null;
  acknowledgementState: number | null;
  purchaseTimeMillis: string | null;
}

let cachedToken: CachedToken | null = null;

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getProductIdsFromProductsV2Response(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return [];
  }

  const lineItems = (payload as { productLineItem?: unknown }).productLineItem;
  if (!Array.isArray(lineItems)) return [];

  const productIds = new Set<string>();
  for (const item of lineItems) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const lineItemProductId = asTrimmedString((item as { productId?: unknown }).productId);
    if (lineItemProductId) {
      productIds.add(lineItemProductId);
    }
    const offerDetails = (item as { productOfferDetails?: unknown }).productOfferDetails;
    if (typeof offerDetails !== "object" || offerDetails === null || Array.isArray(offerDetails)) {
      continue;
    }
    const offerProductId = asTrimmedString((offerDetails as { productId?: unknown }).productId);
    if (offerProductId) {
      productIds.add(offerProductId);
    }
  }

  return Array.from(productIds);
}

function parseProductsV2PurchaseState(rawPurchaseState: string | undefined): number | null {
  if (!rawPurchaseState) return null;
  const normalized = rawPurchaseState.trim().toUpperCase();
  if (normalized === "PURCHASED") return 0;
  if (normalized === "PENDING") return 2;
  if (normalized === "CANCELLED") return 1;
  return null;
}

function parseProductsV2AcknowledgementState(rawAcknowledgementState: string | undefined): number | null {
  if (!rawAcknowledgementState) return null;
  const normalized = rawAcknowledgementState.trim().toUpperCase();
  if (normalized === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" || normalized === "ACKNOWLEDGED") {
    return 1;
  }
  if (normalized === "ACKNOWLEDGEMENT_STATE_PENDING" || normalized === "PENDING") {
    return 0;
  }
  return null;
}

function parsePurchaseCompletionTimeToMillis(rawPurchaseCompletionTime: string | undefined): string | null {
  if (!rawPurchaseCompletionTime) return null;
  const timestamp = Date.parse(rawPurchaseCompletionTime);
  if (!Number.isFinite(timestamp)) return null;
  return String(Math.trunc(timestamp));
}

export function normalizeProductsV2PurchasePayload(payload: unknown): NormalizedProductsV2Purchase {
  const parsed = (typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as GooglePlayProductsV2Response
    : {}) as GooglePlayProductsV2Response;

  const productIds = getProductIdsFromProductsV2Response(parsed);
  const purchaseState = parseProductsV2PurchaseState(asTrimmedString(parsed.purchaseStateContext?.purchaseState) ?? undefined);
  const acknowledgementState = parseProductsV2AcknowledgementState(asTrimmedString(parsed.acknowledgementState) ?? undefined);
  const orderId = asTrimmedString(parsed.orderId);
  const purchaseTimeMillis = parsePurchaseCompletionTimeToMillis(parsed.purchaseCompletionTime);

  return {
    isValid: purchaseState === 0,
    productIds,
    orderId,
    purchaseState,
    acknowledgementState,
    purchaseTimeMillis
  };
}

function sanitizeGoogleApiErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as GoogleApiErrorPayload;
    const message = parsed.error?.message?.trim();
    const reason = parsed.error?.errors?.[0]?.reason?.trim();
    const status = parsed.error?.status?.trim();

    const details = [message, reason, status]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" | ");

    return details || trimmed.slice(0, 300);
  } catch {
    return trimmed.slice(0, 300);
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signJwt(unsignedToken: string, privateKeyPem: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKeyPem, "base64url");
  return `${unsignedToken}.${signature}`;
}

function createServiceAccountJwtAssertion(config: ApiConfig): string {
  if (!config.googlePlayServiceAccountEmail || !config.googlePlayServiceAccountPrivateKey) {
    throw new HttpError(500, "Google Play verification is not configured.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + (60 * 60);

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: config.googlePlayServiceAccountEmail,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: expiresAt
    })
  );

  return signJwt(`${header}.${payload}`, config.googlePlayServiceAccountPrivateKey);
}

async function getGoogleApiAccessToken(config: ApiConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.accessToken;
  }

  const assertion = createServiceAccountJwtAssertion(config);
  const tokenRequestBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetchWithRetry(
    OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenRequestBody.toString()
    },
    {
      maxAttempts: 3,
      timeoutMs: 10_000
    }
  );

  if (!response.ok) {
    throw new HttpError(502, "Failed to obtain Google Play access token.");
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  const accessToken = (payload.access_token ?? "").trim();
  const expiresIn = Number(payload.expires_in ?? 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new HttpError(502, "Google Play access token response is invalid.");
  }

  cachedToken = {
    accessToken,
    expiresAtMs: Date.now() + (expiresIn * 1000)
  };

  return accessToken;
}

export async function verifyPlayProductPurchase(
  config: ApiConfig,
  input: VerifyPlayPurchaseInput
): Promise<VerifyPlayPurchaseResult> {
  const accessToken = await getGoogleApiAccessToken(config);

  const endpoint = [
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications",
    encodeURIComponent(input.packageName),
    "purchases/productsv2/tokens",
    encodeURIComponent(input.purchaseToken)
  ].join("/");

  const response = await fetchWithRetry(
    endpoint,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    {
      maxAttempts: 3,
      timeoutMs: 10_000
    }
  );

  if (response.status === 404) {
    return {
      isValid: false,
      productId: null,
      productIds: [],
      orderId: null,
      purchaseState: null,
      acknowledgementState: null,
      consumptionState: null,
      purchaseTimeMillis: null
    };
  }

  if (!response.ok) {
    const responseText = await response.text();
    const details = sanitizeGoogleApiErrorText(responseText);
    const suffix = details ? `: ${details}` : "";
    throw new HttpError(502, `Google Play purchase verification failed (HTTP ${response.status})${suffix}`);
  }

  const payload = (await response.json()) as GooglePlayProductsV2Response;
  const normalized = normalizeProductsV2PurchasePayload(payload);
  const allowedProductIds = new Set(input.allowedProductIds.map((id) => id.trim()).filter((id) => id.length > 0));
  const matchingProductId = normalized.productIds.find((id) => allowedProductIds.has(id)) ?? null;
  const productId = allowedProductIds.size === 0
    ? (normalized.productIds[0] ?? null)
    : matchingProductId;
  const isAllowedProduct = allowedProductIds.size === 0 || !!matchingProductId;

  return {
    isValid: normalized.isValid && isAllowedProduct,
    productId,
    productIds: normalized.productIds,
    orderId: normalized.orderId,
    purchaseState: normalized.purchaseState,
    acknowledgementState: normalized.acknowledgementState,
    consumptionState: null,
    purchaseTimeMillis: normalized.purchaseTimeMillis
  };
}

export async function acknowledgePlayProductPurchase(
  config: ApiConfig,
  input: AcknowledgePlayPurchaseInput
): Promise<void> {
  const accessToken = await getGoogleApiAccessToken(config);

  const endpoint = [
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications",
    encodeURIComponent(input.packageName),
    "purchases/products",
    encodeURIComponent(input.productId),
    "tokens",
    encodeURIComponent(input.purchaseToken) + ":acknowledge"
  ].join("/");

  const response = await fetchWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    },
    {
      maxAttempts: 3,
      timeoutMs: 10_000
    }
  );

  if (response.ok || response.status === 409) {
    return;
  }

  throw new HttpError(502, "Google Play purchase acknowledgement failed.");
}
