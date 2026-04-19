import "./google-identity-global.ts";

export {
    fetchAuthenticatedApiResponse,
    fetchWithRetry,
    resolveApiBaseUrl
} from "./api-client.ts";
export type { FetchRetryOptions } from "./api-client.ts";
export {
    clearEntitlementCache, CLOUD_SYNC_INTERVAL_MS,
    ENTITLEMENT_CACHE_KEY, getEntitlementTtlMs, GOOGLE_INIT_RETRY_COUNT,
    GOOGLE_INIT_RETRY_DELAY_MS,
    GOOGLE_PROFILE_CACHE_KEY, handleExpiredAuth, PRO_ACCESS_KEY, readEntitlementCache, SYNC_CLIENT_VERSION_KEY,
    SYNC_STATUS_RESET_MS, writeEntitlementCache
} from "./entitlement-cache.ts";
export type { AuthSessionApp, EntitlementApiResponse } from "./entitlement-cache.ts";
export {
    getSupportedPurchaseProviders,
    resolvePurchaseProvider,
    submitPlayPurchaseVerification
} from "./purchase-verification.ts";
export type {
    PurchaseProvider,
    PurchaseVerificationApp,
    VerifyPlayPurchaseRequest
} from "./purchase-verification.ts";

