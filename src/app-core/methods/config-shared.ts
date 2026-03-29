import type { AppContext, AppMethodState } from "../context.ts";
import { getTodayDate, inferDateFromTimestampId, toDateOnly } from "../../shared/lot-dates.ts";

export { getTodayDate, toDateOnly };

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
  | "selectLot"
  | "setCurrentLotCatalogSource"
  | "openRenameLotModal"
  | "renameCurrentLot"
  | "loadLot"
  | "deleteCurrentLot"
  | "canUseAdminLotSyncTools"
  | "importLotsFromUserId"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "savePortfolioReportTable"
  | "calculateProfit"
  | "recalculateDefaultPrices"
  | "calculateOptimalPrices"
  | "setFeeProfilePreset"
  | "updatePurchaseCostInput"
  | "onPurchaseConfigChange"
  | "calculatePriceForUnits"
>;

export function inferDateFromLotId(lotId: number): string | null {
  return inferDateFromTimestampId(lotId);
}
