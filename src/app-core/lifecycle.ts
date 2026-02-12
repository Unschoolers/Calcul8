import type { AppLifecycleObject } from "./context.ts";

export const appLifecycle: AppLifecycleObject = {
  mounted() {
    this.loadPresetsFromStorage();

    const last = Number(localStorage.getItem("rtyh_last_preset_id"));
    if (last && this.presets.some((p) => p.id === last)) {
      this.currentPresetId = last;
      this.loadPreset();
    } else if (this.presets.length > 0) {
      this.currentPresetId = this.presets[0].id;
      this.loadPreset();
    }

    this.getExchangeRate();
    this.loadSalesFromStorage();
    this.syncLivePricesFromDefaults();

    if (import.meta.env.DEV) {
      void this.unregisterServiceWorkersForDev();
    } else {
      this.setupPwaUiHandlers();
      this.registerServiceWorker();
    }
  },

  beforeUnmount() {
    if (this.onlineListener) window.removeEventListener("online", this.onlineListener);
    if (this.offlineListener) window.removeEventListener("offline", this.offlineListener);
    if (this.beforeInstallPromptListener) window.removeEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
    if (this.appInstalledListener) window.removeEventListener("appinstalled", this.appInstalledListener);
  }
};
