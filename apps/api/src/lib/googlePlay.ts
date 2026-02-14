import { createSign } from "node:crypto";
import { HttpError } from "./auth";
import type { ApiConfig } from "../types";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface GooglePlayProductPurchaseResponse {
  orderId?: string;
  purchaseState?: number;
  acknowledgementState?: number;
  consumptionState?: number;
  purchaseTimeMillis?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

interface VerifyPlayPurchaseInput {
  packageName: string;
  productId: string;
  purchaseToken: string;
}

export interface VerifyPlayPurchaseResult {
  isValid: boolean;
  orderId: string | null;
  purchaseState: number | null;
  acknowledgementState: number | null;
  consumptionState: number | null;
  purchaseTimeMillis: string | null;
}

let cachedToken: CachedToken | null = null;

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

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: tokenRequestBody.toString()
  });

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
    "purchases/products",
    encodeURIComponent(input.productId),
    "tokens",
    encodeURIComponent(input.purchaseToken)
  ].join("/");

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 404) {
    return {
      isValid: false,
      orderId: null,
      purchaseState: null,
      acknowledgementState: null,
      consumptionState: null,
      purchaseTimeMillis: null
    };
  }

  if (!response.ok) {
    throw new HttpError(502, "Google Play purchase verification failed.");
  }

  const payload = (await response.json()) as GooglePlayProductPurchaseResponse;
  const purchaseState = typeof payload.purchaseState === "number" ? payload.purchaseState : null;
  const acknowledgementState = typeof payload.acknowledgementState === "number"
    ? payload.acknowledgementState
    : null;
  const consumptionState = typeof payload.consumptionState === "number" ? payload.consumptionState : null;
  const orderId = typeof payload.orderId === "string" ? payload.orderId : null;
  const purchaseTimeMillis = typeof payload.purchaseTimeMillis === "string" ? payload.purchaseTimeMillis : null;

  return {
    isValid: purchaseState === 0,
    orderId,
    purchaseState,
    acknowledgementState,
    consumptionState,
    purchaseTimeMillis
  };
}

