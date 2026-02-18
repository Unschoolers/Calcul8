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

type SyncPayload = {
  lots: unknown[];
  salesByLot: Record<string, Sale[]>;
  clientVersion?: number;
};

function createSyncPayload(context: AppContext, clientVersion?: number): SyncPayload {
  const salesByLot: Record<string, Sale[]> = {};
  for (const preset of context.presets) {
    salesByLot[String(preset.id)] = context.loadSalesForPresetId(preset.id);
  }

  return {
    lots: context.presets,
    salesByLot,
    clientVersion
  };
}

function getSyncPayloadSignature(payload: SyncPayload): string {
  return JSON.stringify({
    lots: payload.lots,
    salesByLot: payload.salesByLot
  });
}

export const uiSyncMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "pullCloudSync"
  | "startCloudSyncScheduler"
  | "stopCloudSyncScheduler"
  | "pushCloudSync"
> = {
  async pullCloudSync(): Promise<void> {
    const base = resolveApiBaseUrl();
    if (!base) return;
    if (!navigator.onLine) {
      this.isOffline = true;
      this.startOfflineReconnectScheduler();
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!googleIdToken) return;

    this.syncStatus = "syncing";
    if (this.syncStatusResetTimeoutId != null) {
      window.clearTimeout(this.syncStatusResetTimeoutId);
      this.syncStatusResetTimeoutId = null;
    }

    try {
      const response = await fetchWithRetry(`${base}/sync/pull`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleIdToken}`
        }
      });

      if (response.status === 401) {
        handleExpiredAuth(this);
        this.syncStatus = "error";
        this.syncStatusResetTimeoutId = window.setTimeout(() => {
          this.syncStatus = "idle";
          this.syncStatusResetTimeoutId = null;
        }, SYNC_STATUS_RESET_MS);
        return;
      }
      if (!response.ok) {
        this.syncStatus = "error";
        this.syncStatusResetTimeoutId = window.setTimeout(() => {
          this.syncStatus = "idle";
          this.syncStatusResetTimeoutId = null;
        }, SYNC_STATUS_RESET_MS);
        console.warn("[whatfees] Cloud sync pull failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const body = (await response.json()) as {
        snapshot?: {
          lots?: unknown[];
          salesByLot?: Record<string, unknown[]>;
          version?: number;
          updatedAt?: string | null;
        };
      };
      const snapshot = body.snapshot;
      if (!snapshot) {
        this.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload(this));
        this.syncStatus = "success";
        this.syncStatusResetTimeoutId = window.setTimeout(() => {
          this.syncStatus = "idle";
          this.syncStatusResetTimeoutId = null;
        }, SYNC_STATUS_RESET_MS);
        return;
      }

      const cloudLots = Array.isArray(snapshot.lots) ? snapshot.lots : [];
      const cloudSalesByLot = snapshot.salesByLot && typeof snapshot.salesByLot === "object"
        ? snapshot.salesByLot
        : {};
      const cloudHasSales = Object.values(cloudSalesByLot).some((sales) => Array.isArray(sales) && sales.length > 0);
      const cloudHasData = cloudLots.length > 0 || cloudHasSales;
      const localHasSales = this.presets.some((preset) => this.loadSalesForPresetId(preset.id).length > 0);
      const localHasData = this.presets.length > 0 || localHasSales;
      const cloudVersion = Number(snapshot.version ?? 0);
      const localVersion = Number(localStorage.getItem(SYNC_CLIENT_VERSION_KEY) || "0");
      const shouldApplyCloud = Number.isFinite(cloudVersion) && (
        cloudVersion > localVersion ||
        (!localHasData && cloudHasData)
      );
      if (!shouldApplyCloud) {
        this.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload(this));
        this.syncStatus = "success";
        this.syncStatusResetTimeoutId = window.setTimeout(() => {
          this.syncStatus = "idle";
          this.syncStatusResetTimeoutId = null;
        }, SYNC_STATUS_RESET_MS);
        return;
      }

      this.presets = cloudLots as typeof this.presets;
      this.savePresetsToStorage();

      Object.entries(cloudSalesByLot).forEach(([presetId, sales]) => {
        if (!Array.isArray(sales)) return;
        localStorage.setItem(this.getSalesStorageKey(Number(presetId)), JSON.stringify(sales));
      });

      if (this.currentPresetId && this.presets.some((p) => p.id === this.currentPresetId)) {
        this.loadPreset();
      } else if (this.presets.length > 0) {
        this.currentPresetId = this.presets[0].id;
        this.loadPreset();
      } else {
        this.currentPresetId = null;
        this.sales = [];
      }

      if (Number.isFinite(cloudVersion)) {
        localStorage.setItem(SYNC_CLIENT_VERSION_KEY, String(cloudVersion));
      }
      this.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload(this));
      this.syncStatus = "success";
      this.syncStatusResetTimeoutId = window.setTimeout(() => {
        this.syncStatus = "idle";
        this.syncStatusResetTimeoutId = null;
      }, SYNC_STATUS_RESET_MS);
      this.notify("Cloud data synced", "success");
      console.info("[whatfees] Cloud sync pulled", { version: cloudVersion });
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
      console.warn("[whatfees] Cloud sync pull error", error);
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

    const previousVersionRaw = localStorage.getItem(SYNC_CLIENT_VERSION_KEY) || "0";
    const previousVersion = Number(previousVersionRaw);
    const clientVersion = Number.isFinite(previousVersion) ? previousVersion : 0;
    const syncPayload = createSyncPayload(this, clientVersion);
    const payloadSignature = getSyncPayloadSignature(syncPayload);
    if (!force && this.lastSyncedPayloadHash === payloadSignature) {
      return;
    }
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
        body: JSON.stringify(syncPayload)
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
