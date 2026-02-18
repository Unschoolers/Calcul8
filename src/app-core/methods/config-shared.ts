import type { Preset, Sale } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

export type ImportablePreset = Preset & { sales?: Sale[] };

export type ConfigMethodSubset<K extends keyof AppMethodState> = ThisType<AppContext> & Pick<AppMethodState, K>;

export type ConfigMethods = ConfigMethodSubset<
  | "getSalesStorageKey"
  | "loadSalesForPresetId"
  | "netFromGross"
  | "getExchangeRate"
  | "loadLotsFromStorage"
  | "loadPresetsFromStorage"
  | "saveLotsToStorage"
  | "savePresetsToStorage"
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "createNewLot"
  | "createNewPreset"
  | "loadLot"
  | "loadPreset"
  | "deleteCurrentLot"
  | "deleteCurrentPreset"
  | "exportLots"
  | "exportPresets"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "importLots"
  | "importPresets"
  | "handleFileImport"
  | "calculateProfit"
  | "recalculateDefaultPrices"
  | "calculateOptimalPrices"
  | "onPurchaseConfigChange"
  | "calculatePriceForUnits"
>;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function isValidDateOnly(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_REGEX.test(value);
}

export function toDateOnly(value: unknown): string | null {
  if (isValidDateOnly(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

export function inferDateFromPresetId(presetId: number): string | null {
  const timestamp = Number(presetId);
  // Millisecond timestamp roughly between 2000 and 2100.
  if (!Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > 4102444800000) {
    return null;
  }
  return new Date(timestamp).toISOString().split("T")[0];
}
