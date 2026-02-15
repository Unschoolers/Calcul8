import type { Sale, SaleType, UiColor } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";
import { initGoogleAutoLoginWithRetry, type GoogleIdentityApi } from "../utils/googleAutoLogin.ts";

interface GoogleAccountsApi {
  id: GoogleIdentityApi;
}

interface GoogleGlobalApi {
  accounts: GoogleAccountsApi;
}

interface EntitlementApiResponse {
  userId?: string;
  hasProAccess?: boolean;
  updatedAt?: string | null;
}

interface EntitlementCachePayload {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
  cachedAt: number;
}

declare global {
  interface Window {
    google?: GoogleGlobalApi;
  }
}

const ENTITLEMENT_CACHE_KEY = "rtyh_entitlement_cache_v1";
const PRO_ACCESS_KEY = "rtyh_pro_access";
const GOOGLE_TOKEN_KEY = "rtyh_google_id_token";
const DEBUG_USER_KEY = "rtyh_debug_user_id";
const SYNC_CLIENT_VERSION_KEY = "rtyh_sync_client_version";
const CLOUD_SYNC_INTERVAL_MS = 60 * 1000;
const SYNC_STATUS_RESET_MS = 2500;
const GOOGLE_INIT_RETRY_COUNT = 20;
const GOOGLE_INIT_RETRY_DELAY_MS = 250;
const API_MAX_RETRY_ATTEMPTS = 3;
const API_BASE_RETRY_DELAY_MS = 500;
const API_FETCH_TIMEOUT_MS = 12_000;

function resolveApiBaseUrl(): string {
  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
  if (configuredApiBase) {
    const normalized = configuredApiBase.replace(/\/+$/, "");
    localStorage.setItem("whatfees_api_base_url", normalized);
    return normalized;
  }
  return "";
}

function getEntitlementTtlMs(): number {
  const raw = (import.meta.env.VITE_ENTITLEMENT_TTL_MINUTES as string | undefined)?.trim() || "";
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 6 * 60 * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

function readEntitlementCache(): EntitlementCachePayload | null {
  const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EntitlementCachePayload>;
    if (typeof parsed.hasProAccess !== "boolean") return null;
    if (!Number.isFinite(parsed.cachedAt)) return null;
    return {
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      hasProAccess: parsed.hasProAccess,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      cachedAt: Number(parsed.cachedAt)
    };
  } catch {
    return null;
  }
}

function writeEntitlementCache(payload: EntitlementCachePayload): void {
  localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(payload));
}

function clearEntitlementCache(): void {
  localStorage.removeItem(ENTITLEMENT_CACHE_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof TypeError;
}

function parseRetryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  {
    maxAttempts = API_MAX_RETRY_ATTEMPTS,
    baseDelayMs = API_BASE_RETRY_DELAY_MS,
    timeoutMs = API_FETCH_TIMEOUT_MS
  }: FetchRetryOptions = {}
): Promise<Response> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });

      if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers);
      const exponentialDelayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 200);
      await sleep(retryAfterMs ?? exponentialDelayMs + jitterMs);
    } catch (error) {
      if (!isRetryableError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const exponentialDelayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 200);
      await sleep(exponentialDelayMs + jitterMs);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

export const uiMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
  | "toggleChartView"
  | "calculateSaleProfit"
  | "getSaleColor"
  | "getSaleIcon"
  | "formatDate"
  | "initGoogleAutoLogin"
  | "openVerifyPurchaseModal"
  | "verifyPlayPurchase"
  | "startCloudSyncScheduler"
  | "stopCloudSyncScheduler"
  | "pushCloudSync"
  | "debugLogEntitlement"
> = {
  toggleTheme(): void {
    this.$vuetify.theme.change(this.isDark ? "unionArenaLight" : "unionArenaDark");
  },

  notify(message: string, color: UiColor = "info"): void {
    this.snackbar.text = message;
    this.snackbar.color = color;
    this.snackbar.show = true;
  },

  askConfirmation(
    { title, text, color = "error" }: { title: string; text: string; color?: UiColor },
    action: () => void
  ): void {
    this.confirmTitle = title;
    this.confirmText = text;
    this.confirmColor = color;
    this.confirmAction = action;
    this.confirmDialog = true;
  },

  runConfirmAction(): void {
    if (typeof this.confirmAction === "function") {
      this.confirmAction();
    }
    this.confirmDialog = false;
    this.confirmAction = null;
  },

  cancelConfirmAction(): void {
    this.confirmDialog = false;
    this.confirmAction = null;
  },

  formatCurrency(value: number | null | undefined, decimals = 2): string {
    if (value == null || isNaN(value)) return "0.00";
    return Number(value).toFixed(decimals);
  },

  safeFixed(value: number, decimals = 2): string {
    return this.formatCurrency(value, decimals);
  },

  toggleChartView(): void {
    this.chartView = this.chartView === "pie" ? "sparkline" : "pie";
  },

  calculateSaleProfit(sale: Sale): number {
    const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
    const netRevenue = this.netFromGross(grossRevenue, sale.buyerShipping || 0, 1);
    const costPerPack = this.totalPacks > 0 ? (this.totalCaseCost / this.totalPacks) : 0;
    const allocatedCost = (sale.packsCount || 0) * costPerPack;
    return netRevenue - allocatedCost;
  },

  getSaleColor(type: SaleType): string {
    if (type === "pack") return "primary";
    if (type === "box") return "secondary";
    return "success";
  },

  getSaleIcon(type: SaleType): string {
    if (type === "pack") return "mdi-package";
    if (type === "box") return "mdi-cube-outline";
    return "mdi-cards-playing-outline";
  },

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  },

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

    const payload: Record<string, string> = {
      purchaseToken
    };
    const productId = this.purchaseProductIdInput.trim();
    const packageName = this.purchasePackageNameInput.trim();
    if (productId) payload.productId = productId;
    if (packageName) payload.packageName = packageName;

    this.isVerifyingPurchase = true;

    try {
      const response = await fetchWithRetry(`${base}/entitlements/verify-play`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${googleIdToken}`
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        localStorage.removeItem(GOOGLE_TOKEN_KEY);
        clearEntitlementCache();
        localStorage.removeItem(PRO_ACCESS_KEY);
        this.hasProAccess = false;
        this.initGoogleAutoLogin();
        this.notify("Your sign-in expired. Please sign in again.", "warning");
        return;
      }

      if (!response.ok) {
        let message = `Purchase verification failed (${response.status}).`;
        try {
          const errorBody = (await response.json()) as { error?: string };
          if (typeof errorBody.error === "string" && errorBody.error.trim()) {
            message = errorBody.error.trim();
          }
        } catch {
          // Keep fallback message when response body is not JSON.
        }
        this.notify(message, "error");
        return;
      }

      await this.debugLogEntitlement(true);
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

  startCloudSyncScheduler(): void {
    if (this.cloudSyncIntervalId != null) return;
    this.cloudSyncIntervalId = window.setInterval(() => {
      void this.pushCloudSync();
    }, CLOUD_SYNC_INTERVAL_MS);
  },

  stopCloudSyncScheduler(): void {
    if (this.cloudSyncIntervalId == null) return;
    window.clearInterval(this.cloudSyncIntervalId);
    this.cloudSyncIntervalId = null;
  },

  async pushCloudSync(force = false): Promise<void> {
    const base = resolveApiBaseUrl();
    if (!base) return;
    if (!navigator.onLine) {
      this.isOffline = true;
      this.startOfflineReconnectScheduler();
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!googleIdToken) return;

    const salesByPreset: Record<string, Sale[]> = {};
    for (const preset of this.presets) {
      salesByPreset[String(preset.id)] = this.loadSalesForPresetId(preset.id);
    }

    const payloadSignature = JSON.stringify({
      presets: this.presets,
      salesByPreset
    });
    if (!force && this.lastSyncedPayloadHash === payloadSignature) {
      return;
    }

    const previousVersionRaw = localStorage.getItem(SYNC_CLIENT_VERSION_KEY) || "0";
    const previousVersion = Number(previousVersionRaw);
    const clientVersion = Number.isFinite(previousVersion) ? previousVersion : 0;
    this.syncStatus = "syncing";
    if (this.syncStatusResetTimeoutId != null) {
      window.clearTimeout(this.syncStatusResetTimeoutId);
      this.syncStatusResetTimeoutId = null;
    }

    try {
      const response = await fetchWithRetry(`${base}/sync/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${googleIdToken}`
        },
        body: JSON.stringify({
          presets: this.presets,
          salesByPreset,
          clientVersion
        })
      });

      if (response.status === 401) {
        localStorage.removeItem(GOOGLE_TOKEN_KEY);
        clearEntitlementCache();
        localStorage.removeItem(PRO_ACCESS_KEY);
        this.hasProAccess = false;
        this.initGoogleAutoLogin();
        this.syncStatus = "error";
        this.syncStatusResetTimeoutId = window.setTimeout(() => {
          this.syncStatus = "idle";
          this.syncStatusResetTimeoutId = null;
        }, SYNC_STATUS_RESET_MS);
        console.warn("[whatfees] Cloud sync skipped: auth expired");
        return;
      }

      if (!response.ok) {
        this.syncStatus = "error";
        this.syncStatusResetTimeoutId = window.setTimeout(() => {
          this.syncStatus = "idle";
          this.syncStatusResetTimeoutId = null;
        }, SYNC_STATUS_RESET_MS);
        console.warn("[whatfees] Cloud sync push failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const body = (await response.json()) as { version?: unknown };
      const serverVersion = Number(body.version);
      if (Number.isFinite(serverVersion)) {
        localStorage.setItem(SYNC_CLIENT_VERSION_KEY, String(serverVersion));
      }
      this.lastSyncedPayloadHash = payloadSignature;
      this.syncStatus = "success";
      this.syncStatusResetTimeoutId = window.setTimeout(() => {
        this.syncStatus = "idle";
        this.syncStatusResetTimeoutId = null;
      }, SYNC_STATUS_RESET_MS);
      console.info("[whatfees] Cloud sync pushed");
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      this.syncStatus = "error";
      this.syncStatusResetTimeoutId = window.setTimeout(() => {
        this.syncStatus = "idle";
        this.syncStatusResetTimeoutId = null;
      }, SYNC_STATUS_RESET_MS);
      console.warn("[whatfees] Cloud sync push error", error);
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
        localStorage.removeItem(GOOGLE_TOKEN_KEY);
        clearEntitlementCache();
        localStorage.removeItem(PRO_ACCESS_KEY);
        this.hasProAccess = false;
        this.initGoogleAutoLogin();
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
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      console.warn("[whatfees] Entitlement sync error", error);
    }
  }
};
