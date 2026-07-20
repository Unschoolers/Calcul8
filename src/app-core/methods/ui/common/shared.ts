import "../auth/google-identity-global.ts";

export {
    fetchAuthenticatedApiResponse,
    fetchWithRetry,
    resolveApiBaseUrl
} from "./api-client.ts";
export type { FetchRetryOptions } from "./api-client.ts";
export {
    applyEntitlementState, clearEntitlementCache, CLOUD_SYNC_INTERVAL_MS,
    ENTITLEMENT_CACHE_KEY, getEntitlementTtlMs, GOOGLE_INIT_RETRY_COUNT,
    GOOGLE_INIT_RETRY_DELAY_MS,
    GOOGLE_PROFILE_CACHE_KEY, handleExpiredAuth, PRO_ACCESS_KEY, readEntitlementCache, SYNC_CLIENT_VERSION_KEY,
    SYNC_STATUS_RESET_MS, writeEntitlementCache
} from "../entitlements/entitlement-cache.ts";
export type {
    ApplyEntitlementStateOptions,
    EntitlementApiResponse,
    EntitlementStatePayload
} from "../entitlements/entitlement-cache.ts";
export type {
    AuthEntitlementSessionContext,
    EntitlementStateContext
} from "../../../context/entitlements.ts";
export {
    getSupportedPurchaseProviders,
    resolvePurchaseProvider,
    submitPlayPurchaseVerification
} from "../entitlements/purchase-verification.ts";
export type {
    PurchaseProvider,
    VerifyPlayPurchaseRequest
} from "../entitlements/purchase-verification.ts";
export type { PurchaseVerificationContext } from "../../../context/entitlements.ts";
