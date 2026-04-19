import { DEFAULT_VALUES } from "../../constants.ts";
import { calculateNetFromGross } from "../../domain/calculations.ts";
import type { Lot, LotSalesCacheEntry, Sale } from "../../types/app.ts";
import {
  getLegacySalesStorageKey,
  getSalesCacheStatusKey,
  getLegacyStorageKeys,
  getScopedPresetsStorageKey,
  getSalesStorageKey as getWhatfeesSalesStorageKey,
  migrateLegacySalesKey,
  readStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";
import { type ConfigMethodSubset, getTodayDate } from "./config-shared.ts";
import { resolveWorkspaceScopeContext } from "../workspace-scope.ts";
import { normalizeStoredLot } from "../shared/normalize-lot.ts";
import { getRootLotSales, replaceRootLotSales, resetRootSalesState } from "../shared/sales-root-state.ts";

type ExchangeRateCacheRecord = {
  cadRate: number;
  fetchedAt: number;
};

const EXCHANGE_RATE_CACHE_KEY = STORAGE_KEYS.EXCHANGE_RATE_CACHE;
const EXCHANGE_RATE_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const LEGACY_KEYS = getLegacyStorageKeys();

function isExchangeRateCacheRecord(value: unknown): value is ExchangeRateCacheRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { cadRate?: unknown; fetchedAt?: unknown };
  const cadRate = Number(candidate.cadRate);
  const fetchedAt = Number(candidate.fetchedAt);
  return Number.isFinite(cadRate) && cadRate > 0 && Number.isFinite(fetchedAt) && fetchedAt > 0;
}

function readExchangeRateCache(): ExchangeRateCacheRecord | null {
  try {
    const raw = localStorage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isExchangeRateCacheRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeExchangeRateCache(cadRate: number, fetchedAt: number): void {
  try {
    const payload: ExchangeRateCacheRecord = { cadRate, fetchedAt };
    localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage write errors (e.g. quota exceeded/private mode restrictions).
  }
}

export const configStorageMethods: ConfigMethodSubset<
  | "getSalesStorageKey"
  | "getSalesCacheEntry"
  | "loadSalesForLotId"
  | "netFromGross"
  | "getExchangeRate"
  | "loadLotsFromStorage"
  | "saveLotsToStorage"
> = {
  getSalesStorageKey(lotId: number): string {
    return getWhatfeesSalesStorageKey(lotId, resolveWorkspaceScopeContext(this));
  },

  getSalesCacheEntry(lotId: number): LotSalesCacheEntry {
    try {
      const scope = resolveWorkspaceScopeContext(this);
      if (scope.isPersonal) {
        migrateLegacySalesKey(lotId);
      }
      const storageKey = this.getSalesStorageKey(lotId);
      const statusKey = getSalesCacheStatusKey(lotId, scope);
      const stored = scope.isPersonal
        ? readStorageWithLegacy(storageKey, getLegacySalesStorageKey(lotId))
        : localStorage.getItem(storageKey);
      if (!stored) {
        return {
          status: "missing",
          sales: []
        };
      }
      const parsed = JSON.parse(stored) as Array<Sale & { buyerShipping?: number }>;
      const normalizedSales = parsed.map((sale) => ({
        ...sale,
        singlesItems: Array.isArray(sale.singlesItems)
          ? sale.singlesItems
            .map((line) => {
              const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
              const price = Math.max(0, Number(line.price) || 0);
              if (quantity <= 0) return null;
              const parsedEntryId = Number(line.singlesPurchaseEntryId);
              const singlesPurchaseEntryId = Number.isFinite(parsedEntryId) && parsedEntryId > 0
                ? Math.floor(parsedEntryId)
                : undefined;
              return {
                singlesPurchaseEntryId,
                quantity,
                price
              };
            })
            .filter((line): line is NonNullable<typeof line> => line != null)
          : undefined,
        customer: typeof sale.customer === "string" ? sale.customer : undefined,
        memo: typeof sale.memo === "string" ? sale.memo : undefined,
        buyerShipping: Number(sale.buyerShipping) || 0
      }));
      const hasExplicitLoadedState = localStorage.getItem(statusKey) === "loaded";
      const isLoaded = hasExplicitLoadedState || normalizedSales.length > 0;
      return {
        status: isLoaded ? "loaded" : "missing",
        sales: normalizedSales
      };
    } catch {
      return {
        status: "missing",
        sales: []
      };
    }
  },

  loadSalesForLotId(lotId: number): Sale[] {
    const inMemorySales = getRootLotSales(this, lotId);
    if (inMemorySales) {
      return inMemorySales;
    }
    if (typeof this.getSalesCacheEntry === "function") {
      const sales = this.getSalesCacheEntry(lotId).sales;
      replaceRootLotSales(this, lotId, sales);
      return sales;
    }
    const sales = configStorageMethods.getSalesCacheEntry.call(this as never, lotId).sales;
    replaceRootLotSales(this, lotId, sales);
    return sales;
  },

  netFromGross(grossRevenue: number, buyerShippingPerOrder = 0, orderCount = 1): number {
    return calculateNetFromGross(grossRevenue, this.sellingTaxPercent, buyerShippingPerOrder, orderCount, this);
  },

  async getExchangeRate(): Promise<void> {
    const now = Date.now();
    const cachedRate = readExchangeRateCache();

    if (cachedRate && now - cachedRate.fetchedAt < EXCHANGE_RATE_CACHE_DURATION_MS) {
      this.exchangeRate = cachedRate.cadRate;
      this.lastFetchTime = cachedRate.fetchedAt;
      return;
    }

    if (this.exchangeRate && this.lastFetchTime && now - this.lastFetchTime < EXCHANGE_RATE_CACHE_DURATION_MS) {
      return;
    }

    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { rates?: { CAD?: number } };
      const nextRate = Number(data?.rates?.CAD);

      if (Number.isFinite(nextRate) && nextRate > 0) {
        this.exchangeRate = nextRate;
        this.lastFetchTime = now;
        writeExchangeRateCache(nextRate, now);
        return;
      }

      throw new Error("Missing CAD rate in response payload");
    } catch (error) {
      if (cachedRate) {
        console.warn("Failed to refresh exchange rate, using cached rate:", error);
        this.exchangeRate = cachedRate.cadRate;
        this.lastFetchTime = cachedRate.fetchedAt;
        return;
      }
      console.warn("Failed to fetch exchange rate, using default:", error);
      this.exchangeRate = DEFAULT_VALUES.EXCHANGE_RATE;
    }
  },

  loadLotsFromStorage(): void {
    this.lots = [];
    resetRootSalesState(this);

    try {
      const scope = resolveWorkspaceScopeContext(this);
      const storageKey = getScopedPresetsStorageKey(scope);
      const stored = scope.isWorkspace
        ? localStorage.getItem(storageKey)
        : readStorageWithLegacy(storageKey, LEGACY_KEYS.PRESETS);
      if (stored) {
        const parsed = JSON.parse(stored) as Lot[];
        const todayDate = getTodayDate();
        this.lots = parsed.map((lot) => normalizeStoredLot(lot, todayDate));
      }
    } catch (error) {
      console.error("Failed to load lots:", error);
      this.lots = [];
    }
  },

  saveLotsToStorage(): void {
    try {
      const scope = resolveWorkspaceScopeContext(this);
      localStorage.setItem(
        getScopedPresetsStorageKey(scope),
        JSON.stringify(this.lots)
      );
    } catch (error) {
      console.error("Failed to save lots:", error);
      this.notify("Could not save lots. Storage may be full.", "error");
    }
  }
};
