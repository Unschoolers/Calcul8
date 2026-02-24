import type { AppLifecycleObject } from "./context.ts";
import type { AppTab } from "../types/app.ts";
import {
  getLegacyStorageKeys,
  migrateLegacyStorageKeys,
  readStorageWithLegacy,
  STORAGE_KEYS
} from "./storageKeys.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

function isAppTab(value: unknown): value is AppTab {
  return value === "config" || value === "live" || value === "sales" || value === "portfolio";
}

export const appLifecycle: AppLifecycleObject = {
  mounted() {
    migrateLegacyStorageKeys();
    this.loadLotsFromStorage();

    const last = Number(readStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID));
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
      const savedTab = localStorage.getItem(STORAGE_KEYS.LAST_TAB);
      const currentLot = this.currentLotId ? this.lots.find((lot) => lot.id === this.currentLotId) : null;
      const currentLotType = currentLot?.lotType === "singles" ? "singles" : "bulk";
      const canRestoreSavedTab = savedTab !== "live" || currentLotType !== "singles";
      if (isAppTab(savedTab) && (savedTab === "config" || this.currentLotId) && canRestoreSavedTab) {
        this.currentTab = savedTab;
      }
    } catch {
      // Ignore storage read errors.
    }

    this.getExchangeRate();
    this.loadSalesFromStorage();
    this.syncLivePricesFromDefaults();
    this.initGoogleAutoLogin();
    void this.debugLogEntitlement(false);
    this.startCloudSyncScheduler();

    if (import.meta.env.DEV) {
      void this.unregisterServiceWorkersForDev();
    } else {
      this.setupPwaUiHandlers();
      this.registerServiceWorker();
    }
  },

  beforeUnmount() {
    this.stopCloudSyncScheduler();
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
    if (this.onlineListener) window.removeEventListener("online", this.onlineListener);
    if (this.offlineListener) window.removeEventListener("offline", this.offlineListener);
    if (this.beforeInstallPromptListener) window.removeEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
    if (this.appInstalledListener) window.removeEventListener("appinstalled", this.appInstalledListener);
  }
};
