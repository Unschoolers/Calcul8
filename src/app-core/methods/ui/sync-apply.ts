import type { AppContext } from "../../context-app.ts";
import { clearScopedSalesStorage, getScopedSyncClientVersionKey } from "../../storageKeys.ts";
import { getActiveStorageScope } from "../../workspace-scope.ts";
import { normalizeStoredLot } from "../../shared/normalize-lot.ts";
import { normalizeWheelConfigs } from "../../shared/normalize-wheel-config.ts";

export interface ParsedCloudSnapshot {
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
  wheelConfigs: unknown[];
  activeWheelConfigId: number | null;
  version: number;
  hasData: boolean;
}

function hasSalesDataByLot(value: Record<string, unknown[]>): boolean {
  return Object.values(value).some((sales) => Array.isArray(sales) && sales.length > 0);
}

export function parseCloudSnapshot(snapshot: unknown): ParsedCloudSnapshot {
  const rawSnapshot = typeof snapshot === "object" && snapshot !== null
    ? snapshot as {
      lots?: unknown[];
      salesByLot?: Record<string, unknown[]>;
      wheelConfigs?: unknown[];
      activeWheelConfigId?: number | null;
      version?: number;
    }
    : {};
  const lots = Array.isArray(rawSnapshot.lots) ? rawSnapshot.lots : [];
  const hasLots = Array.isArray(rawSnapshot.lots) && lots.length > 0;
  const salesByLot = rawSnapshot.salesByLot && typeof rawSnapshot.salesByLot === "object"
    ? rawSnapshot.salesByLot
    : {};
  const hasSalesByLot = Object.prototype.hasOwnProperty.call(rawSnapshot, "salesByLot")
    && rawSnapshot.salesByLot != null
    && typeof rawSnapshot.salesByLot === "object"
    && !Array.isArray(rawSnapshot.salesByLot);
  const wheelConfigs = Array.isArray(rawSnapshot.wheelConfigs) ? rawSnapshot.wheelConfigs : [];
  const hasWheelConfigs = Object.prototype.hasOwnProperty.call(rawSnapshot, "wheelConfigs")
    && Array.isArray(rawSnapshot.wheelConfigs);
  const activeWheelConfigId = rawSnapshot.activeWheelConfigId == null
    ? null
    : (Math.floor(Number(rawSnapshot.activeWheelConfigId) || 0) || null);
  const hasRequiredCollections = hasSalesByLot && hasWheelConfigs;
  const hasData = hasRequiredCollections && (hasLots || hasSalesDataByLot(salesByLot) || wheelConfigs.length > 0);
  const version = Number(rawSnapshot.version ?? 0);

  return {
    lots,
    salesByLot,
    wheelConfigs,
    activeWheelConfigId,
    version: Number.isFinite(version) ? version : 0,
    hasData
  };
}

export function shouldApplyCloudSnapshot(params: {
  cloudVersion: number;
  localVersion: number;
  localHasData: boolean;
  cloudHasData: boolean;
}): boolean {
  if (!Number.isFinite(params.cloudVersion)) return false;
  if (!params.cloudHasData) return false;
  if (params.cloudVersion > params.localVersion) return true;
  return !params.localHasData && params.cloudHasData;
}

export type SyncApplyApp = Pick<
  AppContext,
  | "lots"
  | "wheelConfigs"
  | "activeWheelConfigId"
  | "saveLotsToStorage"
  | "saveWheelConfigsToStorage"
  | "getSalesStorageKey"
  | "currentLotId"
  | "loadLot"
  | "sales"
  | "activeScopeType"
  | "activeWorkspaceId"
>;

export function applyCloudSnapshotToLocal(context: SyncApplyApp, snapshot: ParsedCloudSnapshot): void {
  const todayDate = new Date().toISOString().slice(0, 10);
  const normalizedLots = (snapshot.lots as typeof context.lots).map((lot) => normalizeStoredLot(lot, todayDate));
  clearScopedSalesStorage(getActiveStorageScope(context));
  for (const lot of normalizedLots) {
    const rawSales = snapshot.salesByLot[String(lot.id)];
    const sales = Array.isArray(rawSales) ? rawSales : [];
    localStorage.setItem(context.getSalesStorageKey(lot.id), JSON.stringify(sales));
  }
  context.lots = normalizedLots;
  context.saveLotsToStorage();
  context.wheelConfigs = normalizeWheelConfigs(snapshot.wheelConfigs, normalizedLots);
  context.activeWheelConfigId = context.wheelConfigs.some((config) => config.id === snapshot.activeWheelConfigId)
    ? snapshot.activeWheelConfigId
    : (context.wheelConfigs[0]?.id ?? null);
  context.saveWheelConfigsToStorage();

  if (context.currentLotId && context.lots.some((lot) => lot.id === context.currentLotId)) {
    context.loadLot();
  } else if (context.lots.length > 0) {
    context.currentLotId = context.lots[0].id;
    context.loadLot();
  } else {
    context.currentLotId = null;
    context.sales = [];
  }

  if (Number.isFinite(snapshot.version)) {
    localStorage.setItem(
      getScopedSyncClientVersionKey(getActiveStorageScope(context)),
      String(snapshot.version)
    );
  }
}

