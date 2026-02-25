import { SYNC_CLIENT_VERSION_KEY } from "./shared.ts";
import type { AppContext } from "../../context.ts";

export interface ParsedCloudSnapshot {
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
  version: number;
  hasData: boolean;
}

function hasSalesDataByLot(salesByLot: Record<string, unknown[]>): boolean {
  return Object.values(salesByLot).some((sales) => Array.isArray(sales) && sales.length > 0);
}

export function parseCloudSnapshot(snapshot: unknown): ParsedCloudSnapshot {
  const rawSnapshot = typeof snapshot === "object" && snapshot !== null
    ? snapshot as {
      lots?: unknown[];
      salesByLot?: Record<string, unknown[]>;
      version?: number;
    }
    : {};
  const lots = Array.isArray(rawSnapshot.lots) ? rawSnapshot.lots : [];
  const salesByLot = rawSnapshot.salesByLot && typeof rawSnapshot.salesByLot === "object"
    ? rawSnapshot.salesByLot
    : {};
  const hasData = lots.length > 0 || hasSalesDataByLot(salesByLot);
  const version = Number(rawSnapshot.version ?? 0);

  return {
    lots,
    salesByLot,
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
  if (params.cloudVersion > params.localVersion) return true;
  return !params.localHasData && params.cloudHasData;
}

export function applyCloudSnapshotToLocal(context: AppContext, snapshot: ParsedCloudSnapshot): void {
  context.lots = snapshot.lots as typeof context.lots;
  context.saveLotsToStorage();

  Object.entries(snapshot.salesByLot).forEach(([lotId, sales]) => {
    if (!Array.isArray(sales)) return;
    localStorage.setItem(context.getSalesStorageKey(Number(lotId)), JSON.stringify(sales));
  });

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
    localStorage.setItem(SYNC_CLIENT_VERSION_KEY, String(snapshot.version));
  }
}
