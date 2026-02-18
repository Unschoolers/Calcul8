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
    this.loadPresetsFromStorage();

    const last = Number(readStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID));
    if (last && this.presets.some((p) => p.id === last)) {
      this.currentPresetId = last;
      this.loadPreset();
    } else if (this.presets.length > 0) {
      this.currentPresetId = this.presets[0].id;
      this.loadPreset();
    }

    try {
      const rawFilter = localStorage.getItem(STORAGE_KEYS.PORTFOLIO_FILTER_IDS);
      if (rawFilter) {
        const parsed = JSON.parse(rawFilter) as unknown;
        if (Array.isArray(parsed)) {
          const validPresetIds = new Set(this.presets.map((preset) => preset.id));
          this.portfolioPresetFilterIds = parsed
            .map((value) => Number(value))
            .filter((id) => Number.isFinite(id) && validPresetIds.has(id));
        }
      }
    } catch {
      // Ignore storage/JSON parsing errors.
    }

    try {
      const savedTab = localStorage.getItem(STORAGE_KEYS.LAST_TAB);
      if (isAppTab(savedTab) && (savedTab === "config" || this.currentPresetId)) {
        this.currentTab = savedTab;
      }
    } catch {
      // Ignore storage read errors.
    }

    this.getExchangeRate();
    this.loadSalesFromStorage();
    this.syncLivePricesFromDefaults();
    this.initGoogleAutoLogin();
    void this.debugLogEntitlement(!import.meta.env.DEV);
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
      this.salesChart.destroy();
      this.salesChart = null;
    }
    if (this.portfolioChart) {
      this.portfolioChart.destroy();
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
