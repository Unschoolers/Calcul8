import type { AppLifecycleObject } from "./context.ts";
import type { AppTab, PortfolioLotTypeFilter } from "../types/app.ts";
import {
  getLegacyStorageKeys,
  getScopedLastLotStorageKey,
  getScopedLastSyncedPayloadHashKey,
  migrateLegacyStorageKeys,
  readStorageWithLegacy,
  STORAGE_KEYS
} from "./storageKeys.ts";
import { closeStripeEmbeddedCheckout, handleStripeCheckoutReturn } from "./methods/ui/entitlements-stripe.ts";
import { refreshLotEntityPolling, stopLotEntityPolling } from "./methods/ui/lot-entity-polling.ts";
import { refreshWorkspaceRealtime, stopWorkspaceRealtime } from "./methods/ui/workspace-realtime.ts";
import { getActiveStorageScope } from "./workspace-scope.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

function isAppTab(value: unknown): value is AppTab {
  return value === "config" || value === "live" || value === "sales" || value === "portfolio";
}

function isPortfolioLotTypeFilter(value: unknown): value is PortfolioLotTypeFilter {
  return value === "both" || value === "bulk" || value === "singles";
}

export const appLifecycle: AppLifecycleObject = {
  mounted() {
    migrateLegacyStorageKeys();
    try {
      const inviteToken = new URLSearchParams(window.location.search).get("invite");
      this.pendingWorkspaceInviteToken = String(inviteToken || "").trim();
    } catch {
      this.pendingWorkspaceInviteToken = "";
    }

    this.loadLotsFromStorage();

    const storageScope = getActiveStorageScope(this);
    const scopedLastLotKey = getScopedLastLotStorageKey(storageScope);
    const last = Number(
      storageScope.scopeType === "workspace"
        ? localStorage.getItem(scopedLastLotKey)
        : readStorageWithLegacy(scopedLastLotKey, LEGACY_KEYS.LAST_LOT_ID)
    );
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
    this.syncLivePricesFromDefaults();
    this.initGoogleAutoLogin();
    void (async () => {
      const stripeReturn = await handleStripeCheckoutReturn(this);
      if (stripeReturn !== "success") {
        await this.debugLogEntitlement(false);
      }
    })();
    this.startCloudSyncScheduler();
    refreshLotEntityPolling(this);
    refreshWorkspaceRealtime(this);

    if (import.meta.env.DEV) {
      void this.unregisterServiceWorkersForDev();
    } else {
      this.setupPwaUiHandlers();
      this.registerServiceWorker();
    }
  },

  beforeUnmount() {
    void closeStripeEmbeddedCheckout(this);
    this.stopCloudSyncScheduler();
    stopLotEntityPolling(this);
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
