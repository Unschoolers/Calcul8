import type { AppContext, AppMethodState } from "../../context.ts";
import {
  CLOUD_SYNC_INTERVAL_MS,
  GOOGLE_TOKEN_KEY,
  SYNC_CLIENT_VERSION_KEY,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";
import {
  applyCloudSnapshotToLocal,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot
} from "./sync-apply.ts";
import { requestCloudSyncPull, requestCloudSyncPush, type SyncPullResponseBody, type SyncPushResponseBody } from "./sync-network.ts";
import { createSyncPayload, getSyncPayloadSignature } from "./sync-payload.ts";
import { setSyncStatusError, setSyncStatusSuccess, startSyncStatus } from "./sync-status.ts";

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

    startSyncStatus(this);

    try {
      const response = await requestCloudSyncPull(base, googleIdToken);

      if (response.status === 401) {
        handleExpiredAuth(this);
        setSyncStatusError(this);
        return;
      }
      if (!response.ok) {
        setSyncStatusError(this);
        console.warn("[whatfees] Cloud sync pull failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const body = (await response.json()) as SyncPullResponseBody;
      if (!body.snapshot) {
        this.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload(this));
        setSyncStatusSuccess(this);
        return;
      }

      const parsedSnapshot = parseCloudSnapshot(body.snapshot);
      const localHasSales = this.lots.some((lot) => this.loadSalesForLotId(lot.id).length > 0);
      const localHasData = this.lots.length > 0 || localHasSales;
      const localVersion = Number(localStorage.getItem(SYNC_CLIENT_VERSION_KEY) || "0");
      const shouldApplyCloud = shouldApplyCloudSnapshot({
        cloudVersion: parsedSnapshot.version,
        localVersion,
        localHasData,
        cloudHasData: parsedSnapshot.hasData
      });
      if (!shouldApplyCloud) {
        this.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload(this));
        setSyncStatusSuccess(this);
        return;
      }

      applyCloudSnapshotToLocal(this, parsedSnapshot);
      this.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload(this));
      setSyncStatusSuccess(this);
      this.notify("Cloud data synced", "success");
      console.info("[whatfees] Cloud sync pulled", { version: parsedSnapshot.version });
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      setSyncStatusError(this);
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

    const previousVersionRaw = localStorage.getItem(SYNC_CLIENT_VERSION_KEY) || "0";
    const previousVersion = Number(previousVersionRaw);
    const clientVersion = Number.isFinite(previousVersion) ? previousVersion : 0;
    const syncPayload = createSyncPayload(this, clientVersion);
    const payloadSignature = getSyncPayloadSignature(syncPayload);
    if (!force && this.lastSyncedPayloadHash === payloadSignature) {
      return;
    }
    startSyncStatus(this);

    try {
      const response = await requestCloudSyncPush(base, googleIdToken, syncPayload);

      if (response.status === 401) {
        handleExpiredAuth(this);
        setSyncStatusError(this);
        console.warn("[whatfees] Cloud sync skipped: auth expired");
        return;
      }

      if (!response.ok) {
        setSyncStatusError(this);
        console.warn("[whatfees] Cloud sync push failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const body = (await response.json()) as SyncPushResponseBody;
      const serverVersion = Number(body.version);
      if (Number.isFinite(serverVersion)) {
        localStorage.setItem(SYNC_CLIENT_VERSION_KEY, String(serverVersion));
      }
      this.lastSyncedPayloadHash = payloadSignature;
      setSyncStatusSuccess(this);
      console.info("[whatfees] Cloud sync pushed");
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      setSyncStatusError(this);
      console.warn("[whatfees] Cloud sync push error", error);
    }
  }
};
