import type { Sale } from "../../../../types/app.ts";
import type { AppContext } from "../../../context-app.ts";
import {
  getSalesCacheStatusKey,
  getScopedPresetsStorageKey,
  getScopedSyncClientVersionKey,
  getScopedSystemPricingDefaultsStorageKey,
  getScopedWheelConfigsStorageKey
} from "../../../storageKeys.ts";
import { getActiveStorageScope } from "../../../workspace-scope.ts";
import { normalizeStoredLot } from "../../../shared/normalize-lot.ts";
import { applySystemPricingDefaultsToLot, normalizeSystemPricingDefaults } from "../../../shared/system-pricing-defaults.ts";
import { normalizeWheelConfigs } from "../../../shared/normalize-wheel-config.ts";
import { clearStorageReadFailuresForScope } from "../../../storage-health.ts";
import { commitLocalStorageWrites, type LocalStorageWrite } from "../../../shared/local-storage-transaction.ts";
import {
  parseSyncSnapshotDto,
  type SyncLotDto,
  type SyncSalesByLotDto,
  type SyncWheelConfigDto
} from "./sync-contracts.ts";

export interface ParsedCloudSnapshot {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  systemPricingDefaults?: AppContext["systemPricingDefaults"];
  version: number;
  hasData: boolean;
}

function hasSalesDataByLot(value: Record<string, unknown[]>): boolean {
  return Object.values(value).some((sales) => Array.isArray(sales) && sales.length > 0);
}

export function parseCloudSnapshot(snapshot: unknown): ParsedCloudSnapshot {
  const parsed = parseSyncSnapshotDto(snapshot);
  const { lots, salesByLot, wheelConfigs, activeWheelConfigId, version } = parsed.snapshot;
  const hasLots = lots.length > 0;
  const systemPricingDefaults = parsed.snapshot.systemPricingDefaults
    ? normalizeSystemPricingDefaults(parsed.snapshot.systemPricingDefaults)
    : null;
  const hasData = parsed.hasRequiredCollections
    && (hasLots || hasSalesDataByLot(salesByLot) || wheelConfigs.length > 0 || Boolean(systemPricingDefaults));

  return {
    lots,
    salesByLot,
    wheelConfigs,
    activeWheelConfigId,
    ...(systemPricingDefaults ? { systemPricingDefaults } : {}),
    version,
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
> & Partial<Pick<AppContext, "systemPricingDefaults" | "saveSystemPricingDefaultsToStorage" | "salesByLotId">>;

export function applyCloudSnapshotToLocal(context: SyncApplyApp, snapshot: ParsedCloudSnapshot): void {
  const storageScope = getActiveStorageScope(context);
  const todayDate = new Date().toISOString().slice(0, 10);
  const systemPricingDefaults = snapshot.systemPricingDefaults ?? context.systemPricingDefaults;
  const normalizedLots = (snapshot.lots as unknown as typeof context.lots)
    .map((lot) => normalizeStoredLot(lot, todayDate))
    .map((lot) => systemPricingDefaults ? applySystemPricingDefaultsToLot(lot, systemPricingDefaults) : lot);
  const normalizedWheelConfigs = normalizeWheelConfigs(snapshot.wheelConfigs, normalizedLots);
  const activeWheelConfigId = normalizedWheelConfigs.some((config) => config.id === snapshot.activeWheelConfigId)
    ? snapshot.activeWheelConfigId
    : (normalizedWheelConfigs[0]?.id ?? null);
  const salesByLotId = new Map<number, Sale[]>();
  const writes: LocalStorageWrite[] = [];
  for (const lot of normalizedLots) {
    if (!Object.prototype.hasOwnProperty.call(snapshot.salesByLot, String(lot.id))) {
      continue;
    }
    const rawSales = snapshot.salesByLot[String(lot.id)];
    const sales = Array.isArray(rawSales) ? rawSales as unknown as Sale[] : [];
    salesByLotId.set(lot.id, [...sales]);
    writes.push(
      { key: context.getSalesStorageKey(lot.id), value: JSON.stringify(sales) },
      { key: getSalesCacheStatusKey(lot.id, storageScope), value: "loaded" }
    );
  }
  writes.push(
    { key: getScopedPresetsStorageKey(storageScope), value: JSON.stringify(normalizedLots) },
    { key: getScopedWheelConfigsStorageKey(storageScope), value: JSON.stringify(normalizedWheelConfigs) }
  );
  if (snapshot.systemPricingDefaults) {
    writes.push({
      key: getScopedSystemPricingDefaultsStorageKey(storageScope),
      value: JSON.stringify(snapshot.systemPricingDefaults)
    });
  }
  if (Number.isFinite(snapshot.version)) {
    writes.push({ key: getScopedSyncClientVersionKey(storageScope), value: String(snapshot.version) });
  }

  // Persist the complete prepared snapshot before exposing any of it in memory.
  commitLocalStorageWrites(writes);

  if (snapshot.systemPricingDefaults) context.systemPricingDefaults = snapshot.systemPricingDefaults;
  context.lots = normalizedLots;
  context.wheelConfigs = normalizedWheelConfigs;
  context.activeWheelConfigId = activeWheelConfigId;
  context.salesByLotId = salesByLotId;

  if (context.currentLotId && context.lots.some((lot) => lot.id === context.currentLotId)) {
    context.loadLot();
  } else if (context.lots.length > 0) {
    context.currentLotId = context.lots[0].id;
    context.loadLot();
  } else {
    context.currentLotId = null;
    context.sales = [];
  }

  clearStorageReadFailuresForScope(context, storageScope);
}

