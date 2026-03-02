import type { AppContext, AppMethodState } from "../context.ts";

export type ConfigMethodSubset<K extends keyof AppMethodState> = ThisType<AppContext> & Pick<AppMethodState, K>;

export type ConfigMethods = ConfigMethodSubset<
  | "getSalesStorageKey"
  | "loadSalesForLotId"
  | "netFromGross"
  | "getExchangeRate"
  | "loadLotsFromStorage"
  | "saveLotsToStorage"
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "setLiveSinglesSelection"
  | "addLiveSinglesSelection"
  | "removeLiveSinglesSelection"
  | "clearLiveSinglesSelection"
  | "applyLiveSinglesSuggestedPricing"
  | "resetLiveSinglesPricing"
  | "addSinglesPurchaseRow"
  | "removeSinglesPurchaseRow"
  | "clearSinglesPurchases"
  | "onSinglesPurchaseRowsChange"
  | "importSinglesPurchasesCsv"
  | "confirmSinglesPurchasesCsvImport"
  | "cancelSinglesPurchasesCsvImport"
  | "createNewLot"
  | "setCurrentLotCatalogSource"
  | "openRenameLotModal"
  | "renameCurrentLot"
  | "loadLot"
  | "deleteCurrentLot"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "calculateProfit"
  | "recalculateDefaultPrices"
  | "calculateOptimalPrices"
  | "onPurchaseConfigChange"
  | "calculatePriceForUnits"
>;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDate(): string {
  return formatLocalDate(new Date());
}

function isValidDateOnly(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_REGEX.test(value);
}

export function toDateOnly(value: unknown): string | null {
  if (isValidDateOnly(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalDate(date);
}

export function inferDateFromLotId(lotId: number): string | null {
  const timestamp = Number(lotId);
  // Millisecond timestamp roughly between 2000 and 2100.
  if (!Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > 4102444800000) {
    return null;
  }
  return formatLocalDate(new Date(timestamp));
}
