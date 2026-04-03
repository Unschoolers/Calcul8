import "./google-identity-global.ts";

export type { FetchRetryOptions } from "./api-client.ts";
export {
  fetchAuthenticatedApiResponse,
  fetchWithRetry,
  resolveApiBaseUrl
} from "./api-client.ts";
export type { AuthSessionApp, EntitlementApiResponse } from "./entitlement-cache.ts";
export {
  CLOUD_SYNC_INTERVAL_MS,
  CSRF_TOKEN_KEY,
  ENTITLEMENT_CACHE_KEY,
  GOOGLE_INIT_RETRY_COUNT,
  GOOGLE_INIT_RETRY_DELAY_MS,
  GOOGLE_PROFILE_CACHE_KEY,
  GOOGLE_TOKEN_KEY,
  PRO_ACCESS_KEY,
  SYNC_CLIENT_VERSION_KEY,
  SYNC_STATUS_RESET_MS,
  clearEntitlementCache,
  getEntitlementTtlMs,
  handleExpiredAuth,
  readEntitlementCache,
  writeEntitlementCache
} from "./entitlement-cache.ts";
export type {
  PurchaseProvider,
  PurchaseVerificationApp,
  VerifyPlayPurchaseRequest
} from "./purchase-verification.ts";
export {
  getSupportedPurchaseProviders,
  resolvePurchaseProvider,
  submitPlayPurchaseVerification
} from "./purchase-verification.ts";
