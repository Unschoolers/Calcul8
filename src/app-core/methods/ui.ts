import type { Sale, SaleType, UiColor } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityConfig {
  client_id: string;
  auto_select?: boolean;
  itp_support?: boolean;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleIdentityApi {
  initialize(config: GoogleIdentityConfig): void;
  prompt(): void;
}

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
  | "debugLogEntitlement"
> = {
  toggleTheme(): void {
    this.$vuetify.theme.global.name = this.isDark ? "unionArenaLight" : "unionArenaDark";
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
    const googleId = window.google?.accounts?.id;

    if (!clientId || !googleId) {
      return;
    }

    googleId.initialize({
      client_id: clientId,
      auto_select: true,
      itp_support: true,
      callback: (response: GoogleCredentialResponse) => {
        const idToken = response.credential?.trim();
        if (!idToken) return;
        localStorage.setItem(GOOGLE_TOKEN_KEY, idToken);
        void this.debugLogEntitlement(true);
      }
    });

    googleId.prompt();
  },

  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
    if (!configuredApiBase) {
      console.info("[calcul8tr] Entitlement sync skipped: VITE_API_BASE_URL is not set.");
      return;
    }

    const base = configuredApiBase.replace(/\/+$/, "");
    const debugUserId = localStorage.getItem(DEBUG_USER_KEY) || "debug-user";
    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const cached = readEntitlementCache();
    const ttlMs = getEntitlementTtlMs();
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) {
      this.hasProAccess = cached.hasProAccess;
      localStorage.setItem(PRO_ACCESS_KEY, cached.hasProAccess ? "1" : "0");
      console.info("[calcul8tr] Entitlement cache hit", {
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
      let response = await fetch(`${base}/entitlements/me`, {
        headers: authHeaders
      });

      if (googleIdToken && response.status === 401) {
        localStorage.removeItem(GOOGLE_TOKEN_KEY);
        response = await fetch(`${base}/entitlements/me`, {
          headers: fallbackHeaders
        });
      }

      if (!response.ok) {
        console.warn("[calcul8tr] Entitlement debug fetch failed", {
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

      console.log("[calcul8tr] Entitlement sync", {
        userId,
        hasProAccess,
        updatedAt
      });
    } catch (error) {
      console.warn("[calcul8tr] Entitlement sync error", error);
    }
  }
};
