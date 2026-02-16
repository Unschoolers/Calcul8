import type { Sale } from "../../../types/app.ts";
import type { AppContext, AppMethodState } from "../../context.ts";
import {
  CLOUD_SYNC_INTERVAL_MS,
  GOOGLE_TOKEN_KEY,
  SYNC_CLIENT_VERSION_KEY,
  SYNC_STATUS_RESET_MS,
  fetchWithRetry,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";

export const uiSyncMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "startCloudSyncScheduler"
  | "stopCloudSyncScheduler"
  | "pushCloudSync"
> = {
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
        handleExpiredAuth(this);
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
  }
};
