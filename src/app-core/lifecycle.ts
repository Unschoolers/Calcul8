import type { AppTab, PortfolioLotTypeFilter } from "../types/app.ts";
import { primeStoredAuthSecretsFromStorage } from "./auth/index.ts";
import type { AppContext } from "./context-app.ts";
import type { AppLifecycleObject } from "./context-contracts.ts";
import { isDevNoLoginRoute } from "./dev-nologin.ts";
import { refreshPersonalLotSalesIfStale } from "./methods/sales-freshness.ts";
import { closeStripeEmbeddedCheckout, handleStripeCheckoutReturn } from "./methods/ui/entitlements/entitlements-stripe.ts";
import { stopWorkspaceConfigSyncPush } from "./methods/ui/workspace/workspace-config-sync.ts";
import { refreshWorkspaceRealtime, stopWorkspaceRealtime } from "./methods/ui/workspace/workspace-realtime.ts";
import {
    getScopedLastLotStorageKey,
    getScopedLastSyncedPayloadHashKey,
    STORAGE_KEYS
} from "./storageKeys.ts";
import { getActiveStorageScope } from "./workspace-scope.ts";

function isAppTab(value: unknown): value is AppTab {
  return value === "config" || value === "live" || value === "sales" || value === "portfolio" || value === "wheel";
}

function isPortfolioLotTypeFilter(value: unknown): value is PortfolioLotTypeFilter {
  return value === "both" || value === "bulk" || value === "singles";
}

function refreshForegroundLotSales(context: Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "currentLotId"
  | "getSalesCacheEntry"
  | "getSalesStorageKey"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "notify"
> & Partial<Pick<AppContext, "sales" | "salesByLotId">>): void {
  const currentLotId = Number(context.currentLotId);
  if (!Number.isFinite(currentLotId) || currentLotId <= 0) return;

  void refreshPersonalLotSalesIfStale(context, currentLotId).catch((error) => {
    console.warn("Failed to refresh current lot sales on foreground", error);
  });
}

function canBindForegroundSalesListeners(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export const appLifecycle: AppLifecycleObject = {
  mounted() {
    primeStoredAuthSecretsFromStorage();
    try {
      const inviteToken = new URLSearchParams(window.location.search).get("invite");
      this.pendingWorkspaceInviteToken = String(inviteToken || "").trim();
      const whatnotStatus = new URLSearchParams(window.location.search).get("whatnot");
      this.whatnotCallbackStatus = whatnotStatus === "connected" || whatnotStatus === "error"
        ? whatnotStatus
        : null;
      this.whatnotCallbackMessage = String(
        new URLSearchParams(window.location.search).get("whatnotMessage") || ""
      ).trim();
    } catch {
      this.pendingWorkspaceInviteToken = "";
      this.whatnotCallbackStatus = null;
      this.whatnotCallbackMessage = "";
    }

    this.loadLotsFromStorage();

    const storageScope = getActiveStorageScope(this);
    const scopedLastLotKey = getScopedLastLotStorageKey(storageScope);
    const last = Number(localStorage.getItem(scopedLastLotKey));
    if (last && this.lots.some((p) => p.id === last)) {
      this.currentLotId = last;
      this.loadLot();
    } else if (this.lots.length > 0) {
      this.currentLotId = this.lots[0].id;
      this.loadLot();
    }

    try {
      const rawFilter = localStorage.getItem(STORAGE_KEYS.PORTFOLIO_FILTER_IDS);
      if (rawFilter) {
        const parsed = JSON.parse(rawFilter) as unknown;
        if (Array.isArray(parsed)) {
          const validLotIds = new Set(this.lots.map((lot) => lot.id));
          this.portfolioLotFilterIds = parsed
            .map((value) => Number(value))
            .filter((id) => Number.isFinite(id) && validLotIds.has(id));
        }
      }
    } catch {
      // Ignore storage/JSON parsing errors.
    }

    try {
      const savedTypeFilter = localStorage.getItem(STORAGE_KEYS.PORTFOLIO_FILTER_TYPE);
      if (isPortfolioLotTypeFilter(savedTypeFilter)) {
        this.portfolioLotTypeFilter = savedTypeFilter;
      }
    } catch {
      // Ignore storage read errors.
    }

    try {
      this.lastSyncedPayloadHash = localStorage.getItem(
        getScopedLastSyncedPayloadHashKey(storageScope)
      );
    } catch {
      this.lastSyncedPayloadHash = null;
    }

    try {
      const savedTab = localStorage.getItem(STORAGE_KEYS.LAST_TAB);
      if (isAppTab(savedTab) && (savedTab === "config" || this.currentLotId)) {
        this.currentTab = savedTab;
      }
    } catch {
      // Ignore storage read errors.
    }

    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme === "unionArenaDark" || savedTheme === "unionArenaLight") {
        this.$vuetify.theme.change(savedTheme);
      }
    } catch {
      // Ignore storage read errors.
    }

    this.getExchangeRate();
    this.loadSalesFromStorage();
    this.loadWheelFromStorage();
    this.syncLivePricesFromDefaults();
    this.initGoogleAutoLogin();
    this.$nextTick(() => this.renderGoogleSignInButton());
    // Ensure live pricing is fetched after auth/bootstrap completes on reload.
    // Some auth providers initialize asynchronously; retry a few times so
    // the current lot receives its live pricing without requiring user action.
    void (async () => {
      const retryDelays = [0, 1500, 4000];
      for (const delayMs of retryDelays) {
        if (delayMs) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        try {
          if (!this.currentLotId) return;
          if (this.currentLivePricingVersion != null) return;
          const { fetchAuthoritativeLivePricing } = await import("./methods/sales-live-api.ts");
          const { applyAuthoritativeLivePricingSnapshot } = await import("./methods/config-live-pricing.ts");
          const latest = await fetchAuthoritativeLivePricing(this as any, Number(this.currentLotId));
          if (latest) {
            applyAuthoritativeLivePricingSnapshot(this as any, Number(this.currentLotId), latest);
            return;
          }
        } catch (err) {
          // ignore transient errors and retry
        }
      }
    })();
    if (typeof this.syncGuidedOnboarding === "function") {
      this.syncGuidedOnboarding();
    }
    void (async () => {
      if (isDevNoLoginRoute()) return;
      const stripeReturn = await handleStripeCheckoutReturn(this);
      if (stripeReturn !== "success") {
        await this.debugLogEntitlement(false);
      }
    })();
    if (this.isGoogleSignedIn && !isDevNoLoginRoute()) {
      this.startCloudSyncScheduler();
      void this.refreshWhatnotStatus();
    }
    if (!isDevNoLoginRoute()) {
      refreshWorkspaceRealtime(this);
    }
    if (canBindForegroundSalesListeners() && !isDevNoLoginRoute()) {
      this.windowFocusListener = () => {
        refreshForegroundLotSales(this);
      };
      window.addEventListener("focus", this.windowFocusListener);
      this.documentVisibilityListener = () => {
        if (document.visibilityState !== "visible") return;
        refreshForegroundLotSales(this);
      };
      document.addEventListener("visibilitychange", this.documentVisibilityListener);
    }

    if (import.meta.env.DEV) {
      void this.unregisterServiceWorkersForDev();
    } else {
      this.setupPwaUiHandlers();
      this.registerServiceWorker();
    }
  },

  beforeUnmount() {
    if (typeof this.stopGuidedOnboarding === "function") {
      this.stopGuidedOnboarding();
    }
    void closeStripeEmbeddedCheckout(this);
    this.stopCloudSyncScheduler();
    stopWorkspaceConfigSyncPush(this);
    stopWorkspaceRealtime(this);
    this.stopOfflineReconnectScheduler();
    if (this.salesChart) {
      const maybeDestroy = (this.salesChart as { destroy?: () => void }).destroy;
      if (typeof maybeDestroy === "function") {
        maybeDestroy.call(this.salesChart);
      }
      this.salesChart = null;
    }
    if (this.portfolioChart) {
      const maybeDestroy = (this.portfolioChart as { destroy?: () => void }).destroy;
      if (typeof maybeDestroy === "function") {
        maybeDestroy.call(this.portfolioChart);
      }
      this.portfolioChart = null;
    }
    if (this.syncStatusResetTimeoutId != null) {
      window.clearTimeout(this.syncStatusResetTimeoutId);
      this.syncStatusResetTimeoutId = null;
    }
    if (this.serviceWorkerUpdateIntervalId != null) {
      window.clearInterval(this.serviceWorkerUpdateIntervalId);
      this.serviceWorkerUpdateIntervalId = null;
    }
    if (this.onlineListener) window.removeEventListener("online", this.onlineListener);
    if (this.offlineListener) window.removeEventListener("offline", this.offlineListener);
    if (typeof window !== "undefined" && this.windowFocusListener) {
      window.removeEventListener("focus", this.windowFocusListener);
      this.windowFocusListener = null;
    }
    if (typeof document !== "undefined" && this.documentVisibilityListener) {
      document.removeEventListener("visibilitychange", this.documentVisibilityListener);
      this.documentVisibilityListener = null;
    }
    if (this.beforeInstallPromptListener) window.removeEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
    if (this.appInstalledListener) window.removeEventListener("appinstalled", this.appInstalledListener);
    if (this.serviceWorkerLoadListener) {
      window.removeEventListener("load", this.serviceWorkerLoadListener);
      this.serviceWorkerLoadListener = null;
    }
    if ("serviceWorker" in navigator && this.serviceWorkerControllerChangeListener) {
      navigator.serviceWorker.removeEventListener("controllerchange", this.serviceWorkerControllerChangeListener);
      this.serviceWorkerControllerChangeListener = null;
    }
    this.hasPwaUiHandlersBound = false;
    this.hasRegisteredServiceWorkerLifecycle = false;
  }
};

