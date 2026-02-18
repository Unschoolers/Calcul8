import { DEFAULT_VALUES } from "../../constants.ts";
import { calculateNetFromGross } from "../../domain/calculations.ts";
import type { Preset, Sale } from "../../types/app.ts";
import {
  getLegacySalesStorageKey,
  getLegacyStorageKeys,
  getSalesStorageKey as getWhatfeesSalesStorageKey,
  migrateLegacySalesKey,
  readStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";
import { type ConfigMethodSubset, getTodayDate, inferDateFromPresetId, toDateOnly } from "./config-shared.ts";

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
  | "loadSalesForPresetId"
  | "netFromGross"
  | "getExchangeRate"
  | "loadLotsFromStorage"
  | "loadPresetsFromStorage"
  | "saveLotsToStorage"
  | "savePresetsToStorage"
> = {
  getSalesStorageKey(presetId: number): string {
    return getWhatfeesSalesStorageKey(presetId);
  },

  loadSalesForPresetId(presetId: number): Sale[] {
    try {
      migrateLegacySalesKey(presetId);
      const stored = readStorageWithLegacy(this.getSalesStorageKey(presetId), getLegacySalesStorageKey(presetId));
      if (!stored) return [];
      const parsed = JSON.parse(stored) as Array<Sale & { buyerShipping?: number }>;
      return parsed.map((sale) => ({
        ...sale,
        buyerShipping: Number(sale.buyerShipping) || 0
      }));
    } catch {
      return [];
    }
  },

  netFromGross(grossRevenue: number, buyerShippingPerOrder = 0, orderCount = 1): number {
    return calculateNetFromGross(grossRevenue, this.sellingTaxPercent, buyerShippingPerOrder, orderCount);
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
    this.loadPresetsFromStorage();
  },

  loadPresetsFromStorage(): void {
    try {
      const stored = readStorageWithLegacy(STORAGE_KEYS.PRESETS, LEGACY_KEYS.PRESETS);
      if (stored) {
        const parsed = JSON.parse(stored) as Preset[];
        const todayDate = getTodayDate();
        this.presets = parsed.map((preset) => ({
          ...preset,
          purchaseDate:
            toDateOnly(preset.purchaseDate) ??
            toDateOnly(preset.createdAt) ??
            inferDateFromPresetId(preset.id) ??
            todayDate,
          createdAt:
            toDateOnly(preset.createdAt) ??
            toDateOnly(preset.purchaseDate) ??
            inferDateFromPresetId(preset.id) ??
            todayDate
        }));
      }
    } catch (error) {
      console.error("Failed to load presets:", error);
      this.presets = [];
    }
  },

  savePresetsToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(this.presets));
    } catch (error) {
      console.error("Failed to save presets:", error);
      this.notify("Could not save lots. Storage may be full.", "error");
    }
  },

  saveLotsToStorage(): void {
    this.savePresetsToStorage();
  }
};
