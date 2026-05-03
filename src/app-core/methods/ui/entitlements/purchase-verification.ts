import type { AppContext } from "../../../context-app.ts";
import { fetchWithRetry } from "../common/api-client.ts";
import {
  handleExpiredAuth,
  PRO_ACCESS_KEY,
  writeEntitlementCache
} from "./entitlement-cache.ts";

interface VerifyPlayPurchaseApiResponse {
  ok?: boolean;
  pending?: boolean;
  message?: string;
  error?: string;
  userId?: string;
  hasProAccess?: boolean;
  updatedAt?: string | null;
}

export type PurchaseProvider = "auto" | "play" | "stripe";

export interface VerifyPlayPurchaseRequest {
  baseUrl: string;
  googleIdToken?: string;
  purchaseToken: string;
  productId?: string;
  packageName?: string;
  idempotencyKey?: string;
}

interface SubmitPurchaseVerificationRequest {
  provider: PurchaseProvider;
  baseUrl: string;
  googleIdToken?: string;
  body: Record<string, string>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function buildPurchaseIdempotencyKey(
  provider: string,
  purchaseToken: string,
  productId: string
): Promise<string> {
  const seed = `${provider}:${purchaseToken}:${productId}`;
  const cryptoApi = window.crypto;
  if (cryptoApi?.subtle && typeof TextEncoder !== "undefined") {
    const encoded = new TextEncoder().encode(seed);
    const digest = await cryptoApi.subtle.digest("SHA-256", encoded);
    const hex = bytesToHex(new Uint8Array(digest));
    return `${provider}_${hex.slice(0, 48)}`;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }
  return `${provider}_${Math.abs(hash).toString(16)}_${seed.length}`;
}

export function resolvePurchaseProvider(): PurchaseProvider {
  const raw = String(import.meta.env.VITE_PURCHASE_PROVIDER || "auto")
    .trim()
    .toLowerCase();
  if (raw === "auto") return "auto";
  return raw === "stripe" ? "stripe" : "play";
}

export function getSupportedPurchaseProviders(): PurchaseProvider[] {
  return ["play", "stripe"];
}

async function postPurchaseVerification(
  request: SubmitPurchaseVerificationRequest
): Promise<Response> {
  const { provider, baseUrl, googleIdToken, body } = request;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (googleIdToken && googleIdToken.trim()) {
    headers.Authorization = `Bearer ${googleIdToken.trim()}`;
  }

  const genericRoute = `${baseUrl}/entitlements/verify/${provider}`;
  return fetchWithRetry(genericRoute, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

export type PurchaseVerificationApp = Pick<
  AppContext,
  "googleAuthEpoch" | "hasProAccess" | "notify" | "debugLogEntitlement"
>;

export async function submitPlayPurchaseVerification(
  app: PurchaseVerificationApp,
  payload: VerifyPlayPurchaseRequest
): Promise<boolean> {
  const productId = (payload.productId ?? "").trim();
  const packageName = (payload.packageName ?? "").trim();
  const idempotencyKey = (payload.idempotencyKey ?? "").trim() || await buildPurchaseIdempotencyKey(
    "play",
    payload.purchaseToken,
    productId
  );

  const body: Record<string, string> = {
    purchaseToken: payload.purchaseToken,
    idempotencyKey
  };

  if (productId) body.productId = productId;
  if (packageName) body.packageName = packageName;

  const response = await postPurchaseVerification({
    provider: "play",
    baseUrl: payload.baseUrl,
    googleIdToken: payload.googleIdToken,
    body
  });

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return false;
  }

  if (response.status === 202) {
    let message = "Purchase is pending. Complete payment and check again shortly.";
    try {
      const body = (await response.json()) as VerifyPlayPurchaseApiResponse;
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message.trim();
      }
    } catch {
      // Keep fallback when response payload isn't JSON.
    }
    app.notify(message, "info");
    window.setTimeout(() => {
      void app.debugLogEntitlement(true);
    }, 10_000);
    return false;
  }

  if (!response.ok) {
    let message = `Purchase verification failed (${response.status}).`;
    try {
      const errorBody = (await response.json()) as VerifyPlayPurchaseApiResponse;
      if (typeof errorBody.message === "string" && errorBody.message.trim()) {
        message = errorBody.message.trim();
      } else if (typeof errorBody.error === "string" && errorBody.error.trim()) {
        message = errorBody.error.trim();
      }
    } catch {
      // Keep fallback message when response body is not JSON.
    }
    app.notify(message, "error");
    return false;
  }

  let verifiedPayload: VerifyPlayPurchaseApiResponse | null = null;
  try {
    verifiedPayload = (await response.json()) as VerifyPlayPurchaseApiResponse;
  } catch {
    verifiedPayload = null;
  }

  const hasProAccess =
    typeof verifiedPayload?.hasProAccess === "boolean" ? verifiedPayload.hasProAccess : true;
  const userId = typeof verifiedPayload?.userId === "string" ? verifiedPayload.userId : null;
  const updatedAt = typeof verifiedPayload?.updatedAt === "string" ? verifiedPayload.updatedAt : null;

  app.hasProAccess = hasProAccess;
  localStorage.setItem(PRO_ACCESS_KEY, hasProAccess ? "1" : "0");
  writeEntitlementCache({
    userId,
    hasProAccess,
    updatedAt,
    cachedAt: Date.now()
  });

  void app.debugLogEntitlement(true).catch((error: unknown) => {
    console.warn("[whatfees] Post-purchase entitlement refresh failed", error);
  });
  return true;
}
