import type { AppContext, AppMethodState } from "../../context.ts";
import { initGoogleAutoLoginWithRetry } from "../../utils/googleAutoLogin.ts";
import { getPlayBillingService, purchasePlayProduct } from "../../utils/playBilling.ts";
import {
  DEBUG_USER_KEY,
  GOOGLE_INIT_RETRY_COUNT,
  GOOGLE_INIT_RETRY_DELAY_MS,
  GOOGLE_TOKEN_KEY,
  PRO_ACCESS_KEY,
  clearEntitlementCache,
  fetchWithRetry,
  getEntitlementTtlMs,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl,
  submitPlayPurchaseVerification,
  writeEntitlementCache,
  type EntitlementApiResponse
} from "./shared.ts";

export const uiEntitlementMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "initGoogleAutoLogin"
  | "openVerifyPurchaseModal"
  | "startPlayPurchase"
  | "verifyPlayPurchase"
  | "debugLogEntitlement"
> = {
  initGoogleAutoLogin(): void {
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";
    const existingToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (existingToken) {
      return;
    }

    const cachedEntitlement = readEntitlementCache();
    if (cachedEntitlement?.hasProAccess) {
      this.hasProAccess = true;
      return;
    }

    initGoogleAutoLoginWithRetry({
      clientId,
      getGoogleIdentity: () => window.google?.accounts?.id,
      onCredential: (idToken: string) => {
        localStorage.setItem(GOOGLE_TOKEN_KEY, idToken);
        void this.debugLogEntitlement(true);
      },
      retryCount: GOOGLE_INIT_RETRY_COUNT,
      retryDelayMs: GOOGLE_INIT_RETRY_DELAY_MS,
      schedule: (callback: () => void, delayMs: number) => {
        window.setTimeout(callback, delayMs);
      }
    });
  },

  openVerifyPurchaseModal(): void {
    if (!this.showManualPurchaseVerify) {
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!googleIdToken) {
      this.notify("Sign in with Google first to verify your purchase.", "warning");
      return;
    }

    this.showVerifyPurchaseModal = true;
  },

  async startPlayPurchase(): Promise<void> {
    if (this.hasProAccess) {
      this.notify("Pro is already unlocked on this account.", "info");
      return;
    }

    const base = resolveApiBaseUrl();
    if (!base) {
      this.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!googleIdToken) {
      this.notify("Sign in with Google first to continue.", "warning");
      return;
    }

    const configuredProductId = (import.meta.env.VITE_PLAY_PRO_PRODUCT_ID as string | undefined)?.trim() || "";
    const productId = this.purchaseProductIdInput.trim() || configuredProductId;
    if (!productId) {
      this.notify("Missing Play product configuration (VITE_PLAY_PRO_PRODUCT_ID).", "error");
      return;
    }

    this.isVerifyingPurchase = true;

    try {
      const playBilling = await getPlayBillingService();
      if (!playBilling) {
        this.notify("Google Play billing is not available in this environment.", "warning");
        return;
      }

      const purchase = await purchasePlayProduct(playBilling, productId);
      if (!purchase.purchaseToken) {
        this.notify("Could not read purchase token from Google Play.", "error");
        return;
      }

      const verified = await submitPlayPurchaseVerification(this, {
        baseUrl: base,
        googleIdToken,
        purchaseToken: purchase.purchaseToken,
        productId: purchase.itemId ?? productId,
        packageName: this.purchasePackageNameInput.trim()
      });
      if (!verified) return;

      this.purchaseTokenInput = "";
      this.showVerifyPurchaseModal = false;
      this.notify("Purchase verified. Pro features unlocked.", "success");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError") {
        this.notify("Purchase cancelled.", "info");
        return;
      }
      console.warn("[whatfees] Play purchase error", error);
      this.notify("Could not complete Google Play purchase. Please try again.", "error");
    } finally {
      this.isVerifyingPurchase = false;
    }
  },

  async verifyPlayPurchase(): Promise<void> {
    const base = resolveApiBaseUrl();
    if (!base) {
      this.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
      return;
    }

    const purchaseToken = this.purchaseTokenInput.trim();
    if (!purchaseToken) {
      this.notify("Enter a purchase token to continue.", "warning");
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!googleIdToken) {
      this.notify("Sign in with Google first to verify your purchase.", "warning");
      return;
    }

    this.isVerifyingPurchase = true;

    try {
      const verified = await submitPlayPurchaseVerification(this, {
        baseUrl: base,
        googleIdToken,
        purchaseToken,
        productId: this.purchaseProductIdInput.trim(),
        packageName: this.purchasePackageNameInput.trim()
      });
      if (!verified) return;
      this.purchaseTokenInput = "";
      this.showVerifyPurchaseModal = false;
      this.notify("Purchase verified. Pro features unlocked.", "success");
    } catch (error) {
      console.warn("[whatfees] Purchase verification error", error);
      this.notify("Could not verify purchase. Please try again.", "error");
    } finally {
      this.isVerifyingPurchase = false;
    }
  },

  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    const base = resolveApiBaseUrl();
    if (!base) {
      console.info("[whatfees] Entitlement sync skipped: VITE_API_BASE_URL is not set.");
      return;
    }
    const debugUserId = localStorage.getItem(DEBUG_USER_KEY) || "debug-user";
    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const cached = readEntitlementCache();
    const ttlMs = getEntitlementTtlMs();
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) {
      this.hasProAccess = cached.hasProAccess;
      localStorage.setItem(PRO_ACCESS_KEY, cached.hasProAccess ? "1" : "0");
      console.info("[whatfees] Entitlement cache hit", {
        userId: cached.userId,
        hasProAccess: cached.hasProAccess,
        updatedAt: cached.updatedAt
      });
      if (googleIdToken) {
        await this.pullCloudSync();
      }
      return;
    }

    const authHeaders: Record<string, string> = googleIdToken
      ? { Authorization: `Bearer ${googleIdToken}` }
      : { "x-user-id": debugUserId };

    const fallbackHeaders: Record<string, string> = { "x-user-id": debugUserId };

    try {
      let response = await fetchWithRetry(`${base}/entitlements/me`, {
        headers: authHeaders
      });

      if (googleIdToken && response.status === 401) {
        handleExpiredAuth(this);
        response = await fetchWithRetry(`${base}/entitlements/me`, {
          headers: fallbackHeaders
        });
      }

      if (!response.ok) {
        console.warn("[whatfees] Entitlement debug fetch failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const data = (await response.json()) as EntitlementApiResponse;
      const hasProAccess = Boolean(data.hasProAccess);
      const userId = typeof data.userId === "string" ? data.userId : null;
      const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;

      this.hasProAccess = hasProAccess;
      localStorage.setItem(PRO_ACCESS_KEY, hasProAccess ? "1" : "0");
      writeEntitlementCache({
        userId,
        hasProAccess,
        updatedAt,
        cachedAt: Date.now()
      });

      console.log("[whatfees] Entitlement sync", {
        userId,
        hasProAccess,
        updatedAt
      });

      if (googleIdToken) {
        await this.pullCloudSync();
      }
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      console.warn("[whatfees] Entitlement sync error", error);
    }
  }
};
