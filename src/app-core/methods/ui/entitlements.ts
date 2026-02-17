import type { AppContext, AppMethodState } from "../../context.ts";
import { initGoogleAutoLoginWithRetry } from "../../utils/googleAutoLogin.ts";
import {
  extractPurchaseTokenFromResult,
  getPlayBillingService,
  isPlayBillingPaymentRequestSupported,
  purchasePlayProduct,
  type DigitalGoodsService
} from "../../utils/playBilling.ts";
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

function formatPlayPurchaseError(error: unknown): string {
  if (error instanceof Error) {
    const message = `${error.name}${error.message ? `: ${error.message}` : ""}`.trim();
    return message || "Unknown purchase error.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    const parts: string[] = [];
    if (typeof code === "string" && code.trim()) parts.push(`code=${code.trim()}`);
    if (typeof message === "string" && message.trim()) parts.push(message.trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Unknown purchase error.";
}

function isAlreadyOwnedPurchaseError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      responseCode?: unknown;
      reason?: unknown;
      details?: { responseCode?: unknown; reason?: unknown } | unknown;
      result?: { responseCode?: unknown; reason?: unknown } | unknown;
    };

    const rawCodes = [
      candidate.code,
      candidate.responseCode,
      (typeof candidate.details === "object" && candidate.details !== null
        ? (candidate.details as { responseCode?: unknown }).responseCode
        : undefined),
      (typeof candidate.result === "object" && candidate.result !== null
        ? (candidate.result as { responseCode?: unknown }).responseCode
        : undefined)
    ];

    for (const rawCode of rawCodes) {
      if (rawCode === 7) return true; // BillingResponseCode.ITEM_ALREADY_OWNED
      if (typeof rawCode === "string") {
        const normalized = rawCode.trim().toUpperCase();
        if (
          normalized === "ITEM_ALREADY_OWNED" ||
          normalized === "ALREADY_OWNED" ||
          normalized === "7"
        ) {
          return true;
        }
      }
    }

    const rawReasons = [
      candidate.reason,
      (typeof candidate.details === "object" && candidate.details !== null
        ? (candidate.details as { reason?: unknown }).reason
        : undefined),
      (typeof candidate.result === "object" && candidate.result !== null
        ? (candidate.result as { reason?: unknown }).reason
        : undefined)
    ];

    for (const rawReason of rawReasons) {
      if (typeof rawReason === "string") {
        const normalized = rawReason.trim().toUpperCase();
        if (normalized === "ITEM_ALREADY_OWNED" || normalized === "ALREADY_OWNED") {
          return true;
        }
      }
    }
  }

  // Fallback for runtimes that only expose unstructured messages.
  const detail = formatPlayPurchaseError(error).toLowerCase();
  return detail.includes("already own")
    || detail.includes("already owned")
    || detail.includes("item already")
    || detail.includes("owned item");
}

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
    if (this.isVerifyingPurchase) {
      return;
    }

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
    const productId = configuredProductId || this.purchaseProductIdInput.trim();
    if (!productId) {
      this.notify("Missing Play product configuration (VITE_PLAY_PRO_PRODUCT_ID).", "error");
      return;
    }

    this.isVerifyingPurchase = true;
    let playBilling: DigitalGoodsService | null = null;

    try {
      playBilling = await getPlayBillingService();
      if (!playBilling && !isPlayBillingPaymentRequestSupported()) {
        this.notify("Google Play billing is not available in this environment.", "warning");
        return;
      }

      // Fast path: if user already owns the product, verify entitlement directly
      // instead of attempting a fresh purchase flow.
      if (playBilling && typeof playBilling.listPurchases === "function") {
        try {
          const listedPurchases = await playBilling.listPurchases();
          const existing = extractPurchaseTokenFromResult(listedPurchases, productId);
          if (existing.purchaseToken) {
            const verified = await submitPlayPurchaseVerification(this, {
              baseUrl: base,
              googleIdToken,
              purchaseToken: existing.purchaseToken,
              productId
            });
            if (verified) {
              this.purchaseTokenInput = "";
              this.purchaseProductIdInput = "";
              this.purchasePackageNameInput = "";
              this.showVerifyPurchaseModal = false;
              this.notify("Existing purchase found and verified. Pro features unlocked.", "success");
              return;
            }
          }
        } catch (existingPurchaseError) {
          console.warn("[whatfees] Existing purchase pre-check failed", existingPurchaseError);
        }
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
        productId
      });
      if (!verified) return;

      this.purchaseTokenInput = "";
      this.purchaseProductIdInput = "";
      this.purchasePackageNameInput = "";
      this.showVerifyPurchaseModal = false;
      this.notify("Purchase verified. Pro features unlocked.", "success");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const isAbortError = name === "AbortError";
      const isAlreadyOwnedError = isAlreadyOwnedPurchaseError(error);
      const canTryRecovery = !!playBilling
        && typeof playBilling.listPurchases === "function"
        && (!isAbortError || isAlreadyOwnedError);

      // Recovery path: if purchase API fails (especially already-owned), try reading existing purchases.
      if (canTryRecovery) {
        try {
          const listedPurchases = await playBilling.listPurchases();
          const existing = extractPurchaseTokenFromResult(listedPurchases, productId);
          if (existing.purchaseToken) {
            const verified = await submitPlayPurchaseVerification(this, {
              baseUrl: base,
              googleIdToken,
              purchaseToken: existing.purchaseToken,
              productId
            });
            if (verified) {
              this.purchaseTokenInput = "";
              this.purchaseProductIdInput = "";
              this.purchasePackageNameInput = "";
              this.showVerifyPurchaseModal = false;
              this.notify("Existing purchase found and verified. Pro features unlocked.", "success");
              return;
            }
          }
        } catch (recoveryError) {
          console.warn("[whatfees] Play purchase recovery failed", recoveryError);
        }
      }

      if (isAbortError && !isAlreadyOwnedError) {
        this.notify("Purchase cancelled.", "info");
        return;
      }

      console.warn("[whatfees] Play purchase error", error);
      const detail = formatPlayPurchaseError(error);
      this.notify(`Could not complete Google Play purchase. ${detail}`, "error");
    } finally {
      this.isVerifyingPurchase = false;
    }
  },

  async verifyPlayPurchase(): Promise<void> {
    if (this.isVerifyingPurchase) {
      return;
    }

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
