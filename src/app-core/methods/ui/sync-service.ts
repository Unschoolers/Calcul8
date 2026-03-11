import type { AppContext } from "../../context.ts";
import {
  CLOUD_SYNC_INTERVAL_MS,
  GOOGLE_TOKEN_KEY,
  SYNC_CLIENT_VERSION_KEY,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";
import { STORAGE_KEYS } from "../../storageKeys.ts";
import {
  applyCloudSnapshotToLocal,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  type ParsedCloudSnapshot
} from "./sync-apply.ts";
import { requestCloudSyncPull, requestCloudSyncPush, type SyncPullResponseBody, type SyncPushResponseBody } from "./sync-network.ts";
import { createSyncPayload, getSyncPayloadSignature, type SyncPayload } from "./sync-payload.ts";
import { setSyncStatusError, setSyncStatusSuccess, startSyncStatus } from "./sync-status.ts";

const STORAGE_RESET_RECOVERY_COOLDOWN_MS = 30_000;

type SyncRecoveryState = {
  __syncStorageResetRecoveryAtMs?: number;
};

export type SyncApp = Pick<
  AppContext,
  | "lots"
  | "sales"
  | "currentLotId"
  | "cloudSyncIntervalId"
  | "syncStatusResetTimeoutId"
  | "syncStatus"
  | "isOffline"
  | "lastSyncedPayloadHash"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "loadSalesForLotId"
  | "getSalesStorageKey"
  | "saveLotsToStorage"
  | "loadLot"
  | "notify"
  | "startOfflineReconnectScheduler"
  | "pullCloudSync"
>;

type SyncServiceDeps = {
  resolveApiBaseUrl: () => string;
  getGoogleIdToken: () => string;
  isOnline: () => boolean;
  requestCloudSyncPull: typeof requestCloudSyncPull;
  requestCloudSyncPush: typeof requestCloudSyncPush;
  createSyncPayload: (app: SyncApp, clientVersion?: number) => SyncPayload;
  getSyncPayloadSignature: (payload: SyncPayload) => string;
  parseCloudSnapshot: (snapshot: unknown) => ParsedCloudSnapshot;
  shouldApplyCloudSnapshot: typeof shouldApplyCloudSnapshot;
  applyCloudSnapshotToLocal: (app: SyncApp, snapshot: ParsedCloudSnapshot) => void;
  startSyncStatus: (app: SyncApp) => void;
  setSyncStatusSuccess: (app: SyncApp) => void;
  setSyncStatusError: (app: SyncApp) => void;
  handleExpiredAuth: (app: Pick<SyncApp, "googleAuthEpoch" | "hasProAccess">) => void;
  getStoredClientVersion: () => number;
  setStoredClientVersion: (version: number) => void;
  hasStorageItem: (key: string) => boolean;
  now: () => number;
};

const defaultDeps: SyncServiceDeps = {
  resolveApiBaseUrl,
  getGoogleIdToken: () => (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim(),
  isOnline: () => navigator.onLine,
  requestCloudSyncPull,
  requestCloudSyncPush,
  createSyncPayload: (app, clientVersion) => createSyncPayload(app, clientVersion),
  getSyncPayloadSignature,
  parseCloudSnapshot,
  shouldApplyCloudSnapshot,
  applyCloudSnapshotToLocal,
  startSyncStatus,
  setSyncStatusSuccess,
  setSyncStatusError,
  handleExpiredAuth,
  getStoredClientVersion: () => {
    const raw = localStorage.getItem(SYNC_CLIENT_VERSION_KEY) || "0";
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  setStoredClientVersion: (version) => {
    localStorage.setItem(SYNC_CLIENT_VERSION_KEY, String(version));
  },
  hasStorageItem: (key) => !!localStorage.getItem(key),
  now: () => Date.now()
};

function isLocalSyncCacheReset(app: SyncApp, deps: SyncServiceDeps): boolean {
  if (!app.lastSyncedPayloadHash) return false;
  if (!Array.isArray(app.lots) || app.lots.length === 0) return false;

  try {
    if (deps.hasStorageItem(STORAGE_KEYS.PRESETS)) return false;

    const hasAnyInMemorySales = Array.isArray(app.sales) && app.sales.length > 0;
    const hasAnyPersistedSales = app.lots.some((lot) => deps.hasStorageItem(app.getSalesStorageKey(lot.id)));
    return hasAnyInMemorySales || !hasAnyPersistedSales;
  } catch {
    return false;
  }
}

function shouldAttemptStorageResetRecovery(app: SyncApp, deps: SyncServiceDeps): boolean {
  const state = app as SyncApp & SyncRecoveryState;
  const nowMs = deps.now();
  const lastAttemptMs = Number(state.__syncStorageResetRecoveryAtMs ?? 0);
  if (Number.isFinite(lastAttemptMs) && lastAttemptMs > 0 && nowMs - lastAttemptMs < STORAGE_RESET_RECOVERY_COOLDOWN_MS) {
    return false;
  }
  state.__syncStorageResetRecoveryAtMs = nowMs;
  return true;
}

export async function runCloudSyncPull(app: SyncApp, deps: Partial<SyncServiceDeps> = {}): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SyncServiceDeps;
  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) return;
  if (!resolvedDeps.isOnline()) {
    app.isOffline = true;
    app.startOfflineReconnectScheduler();
    return;
  }

  const googleIdToken = resolvedDeps.getGoogleIdToken();
  resolvedDeps.startSyncStatus(app);

  try {
    const response = await resolvedDeps.requestCloudSyncPull(base, googleIdToken);

    if (response.status === 401) {
      resolvedDeps.handleExpiredAuth(app);
      resolvedDeps.setSyncStatusError(app);
      return;
    }
    if (!response.ok) {
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync pull failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPullResponseBody;
    if (!body.snapshot) {
      app.lastSyncedPayloadHash = resolvedDeps.getSyncPayloadSignature(resolvedDeps.createSyncPayload(app));
      resolvedDeps.setSyncStatusSuccess(app);
      return;
    }

    const parsedSnapshot = resolvedDeps.parseCloudSnapshot(body.snapshot);
    const localHasSales = app.lots.some((lot) => app.loadSalesForLotId(lot.id).length > 0);
    const localHasData = app.lots.length > 0 || localHasSales;
    const localVersion = resolvedDeps.getStoredClientVersion();
    const shouldApplyCloud = resolvedDeps.shouldApplyCloudSnapshot({
      cloudVersion: parsedSnapshot.version,
      localVersion,
      localHasData,
      cloudHasData: parsedSnapshot.hasData
    });
    if (!shouldApplyCloud) {
      app.lastSyncedPayloadHash = resolvedDeps.getSyncPayloadSignature(resolvedDeps.createSyncPayload(app));
      resolvedDeps.setSyncStatusSuccess(app);
      return;
    }

    resolvedDeps.applyCloudSnapshotToLocal(app, parsedSnapshot);
    app.lastSyncedPayloadHash = resolvedDeps.getSyncPayloadSignature(resolvedDeps.createSyncPayload(app));
    resolvedDeps.setSyncStatusSuccess(app);
    app.notify("Cloud data synced", "success");
    console.info("[whatfees] Cloud sync pulled", { version: parsedSnapshot.version });
  } catch (error) {
    if (!resolvedDeps.isOnline()) {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    }
    resolvedDeps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync pull error", error);
  }
}

export function startCloudSyncScheduler(app: SyncApp, deps: Partial<SyncServiceDeps> = {}): void {
  if (app.cloudSyncIntervalId != null) return;
  app.cloudSyncIntervalId = window.setInterval(() => {
    void runCloudSyncPush(app, false, deps);
  }, CLOUD_SYNC_INTERVAL_MS);
}

export function stopCloudSyncScheduler(app: Pick<SyncApp, "cloudSyncIntervalId">): void {
  if (app.cloudSyncIntervalId == null) return;
  window.clearInterval(app.cloudSyncIntervalId);
  app.cloudSyncIntervalId = null;
}

export async function runCloudSyncPush(
  app: SyncApp,
  force = false,
  deps: Partial<SyncServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SyncServiceDeps;
  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) return;
  if (!resolvedDeps.isOnline()) {
    app.isOffline = true;
    app.startOfflineReconnectScheduler();
    return;
  }

  const googleIdToken = resolvedDeps.getGoogleIdToken();

  if (isLocalSyncCacheReset(app, resolvedDeps)) {
    console.warn("[whatfees] Cloud sync push skipped: local cache reset detected, pulling first");
    if (shouldAttemptStorageResetRecovery(app, resolvedDeps)) {
      await app.pullCloudSync();
    }
    return;
  }

  const clientVersion = resolvedDeps.getStoredClientVersion();
  const syncPayload = resolvedDeps.createSyncPayload(app, clientVersion);
  const payloadSignature = resolvedDeps.getSyncPayloadSignature(syncPayload);
  if (!force && app.lastSyncedPayloadHash === payloadSignature) {
    return;
  }
  resolvedDeps.startSyncStatus(app);

  try {
    const response = await resolvedDeps.requestCloudSyncPush(base, googleIdToken, syncPayload);

    if (response.status === 401) {
      resolvedDeps.handleExpiredAuth(app);
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync skipped: auth expired");
      return;
    }

    if (!response.ok) {
      resolvedDeps.setSyncStatusError(app);
      console.warn("[whatfees] Cloud sync push failed", {
        status: response.status,
        statusText: response.statusText
      });
      return;
    }

    const body = (await response.json()) as SyncPushResponseBody;
    const serverVersion = Number(body.version);
    if (Number.isFinite(serverVersion)) {
      resolvedDeps.setStoredClientVersion(serverVersion);
    }
    app.lastSyncedPayloadHash = payloadSignature;
    resolvedDeps.setSyncStatusSuccess(app);
    console.info("[whatfees] Cloud sync pushed");
  } catch (error) {
    if (!resolvedDeps.isOnline()) {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    }
    resolvedDeps.setSyncStatusError(app);
    console.warn("[whatfees] Cloud sync push error", error);
  }
}
