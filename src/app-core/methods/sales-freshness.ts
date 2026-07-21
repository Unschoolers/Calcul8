import type { LotSalesSyncMeta, Sale } from "../../types/app.ts";
import type { SalesFreshnessContext } from "../context/commerce.ts";
import { getSalesSyncMetaKey } from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import {
  fetchAuthoritativeLotSalesSyncMeta,
  fetchAuthoritativeSales
} from "./lot-sales-api.ts";

const inFlightSalesFreshnessChecks = new WeakMap<object, Map<number, Promise<boolean>>>();

function isPersonalScope(context: Pick<SalesFreshnessContext, "activeScopeType" | "activeWorkspaceId">): boolean {
  return context.activeScopeType !== "workspace" || !context.activeWorkspaceId;
}

function getSalesFreshnessCheckMap(context: object): Map<number, Promise<boolean>> {
  let checks = inFlightSalesFreshnessChecks.get(context);
  if (!checks) {
    checks = new Map<number, Promise<boolean>>();
    inFlightSalesFreshnessChecks.set(context, checks);
  }
  return checks;
}

export function buildLotSalesSyncMetaFromSales(sales: Sale[]): LotSalesSyncMeta {
  let latestUpdatedAt: string | null = null;
  for (const sale of sales) {
    const updatedAt = typeof sale.updatedAt === "string" && sale.updatedAt.trim()
      ? sale.updatedAt
      : null;
    if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
      latestUpdatedAt = updatedAt;
    }
  }

  return {
    activeCount: sales.length,
    latestUpdatedAt
  };
}

export function readStoredLotSalesSyncMeta(
  context: Pick<SalesFreshnessContext, "activeScopeType" | "activeWorkspaceId">,
  lotId: number
): LotSalesSyncMeta | null {
  try {
    const raw = localStorage.getItem(getSalesSyncMetaKey(lotId, getActiveStorageScope(context)));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LotSalesSyncMeta> | null;
    const activeCount = Number(parsed?.activeCount);
    if (!Number.isFinite(activeCount) || activeCount < 0) {
      return null;
    }

    return {
      activeCount: Math.floor(activeCount),
      latestUpdatedAt: typeof parsed?.latestUpdatedAt === "string" && parsed.latestUpdatedAt.trim()
        ? parsed.latestUpdatedAt
        : null
    };
  } catch {
    return null;
  }
}

export function persistStoredLotSalesSyncMeta(
  context: Pick<SalesFreshnessContext, "activeScopeType" | "activeWorkspaceId">,
  lotId: number,
  meta: LotSalesSyncMeta
): void {
  try {
    localStorage.setItem(
      getSalesSyncMetaKey(lotId, getActiveStorageScope(context)),
      JSON.stringify(meta)
    );
  } catch {
    // Ignore storage write failures.
  }
}

function areLotSalesSyncMetaEqual(left: LotSalesSyncMeta | null, right: LotSalesSyncMeta | null): boolean {
  return (left?.activeCount ?? 0) === (right?.activeCount ?? 0)
    && (left?.latestUpdatedAt ?? null) === (right?.latestUpdatedAt ?? null);
}

export async function hydrateAuthoritativeLotSalesWithSyncMeta(
  context: SalesFreshnessContext,
  lotId: number
): Promise<Sale[] | null> {
  const [sales, salesMeta] = await Promise.all([
    fetchAuthoritativeSales(context, lotId),
    fetchAuthoritativeLotSalesSyncMeta(context, lotId).catch(() => null)
  ]);

  if (salesMeta) {
    persistStoredLotSalesSyncMeta(context, lotId, salesMeta);
  } else if (sales) {
    persistStoredLotSalesSyncMeta(context, lotId, buildLotSalesSyncMetaFromSales(sales));
  }

  return sales;
}

export async function refreshPersonalLotSalesIfStale(
  context: SalesFreshnessContext,
  lotId: number
): Promise<boolean> {
  if (!isPersonalScope(context)) return false;

  const checks = getSalesFreshnessCheckMap(context as object);
  const existing = checks.get(lotId);
  if (existing) {
    return existing;
  }

  const pendingCheck = (async () => {
    const cacheEntry = context.getSalesCacheEntry(lotId);
    if (cacheEntry.status !== "loaded") {
      return Boolean(await hydrateAuthoritativeLotSalesWithSyncMeta(context, lotId));
    }

    const storedMeta = readStoredLotSalesSyncMeta(context, lotId);
    if (!storedMeta) {
      return Boolean(await hydrateAuthoritativeLotSalesWithSyncMeta(context, lotId));
    }

    const latestMeta = await fetchAuthoritativeLotSalesSyncMeta(context, lotId);
    if (!latestMeta) {
      return false;
    }

    persistStoredLotSalesSyncMeta(context, lotId, latestMeta);
    if (areLotSalesSyncMetaEqual(storedMeta, latestMeta)) {
      return false;
    }

    return Boolean(await fetchAuthoritativeSales(context, lotId));
  })().finally(() => {
    checks.delete(lotId);
  });

  checks.set(lotId, pendingCheck);
  return pendingCheck;
}
