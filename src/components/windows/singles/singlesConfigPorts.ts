import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type { RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { AppState } from "../../../types/app.ts";

const singlesConfigPortKeys = [
  "currentLotId", "lots", "currentLotCatalogSource", "singlesPurchases", "singlesSoldCountByPurchaseId",
  "sellingCurrency", "exchangeRate", "preferredLanguage", "currency", "conversionInfo",
  "singlesPurchaseTotalCost", "singlesPurchaseTotalMarketValue",
  "showSinglesCsvMapperModal", "singlesCsvImportHeaders", "singlesCsvImportRows", "singlesCsvImportCurrency",
  "singlesCsvImportMode", "singlesCsvMapItem", "singlesCsvMapCardNumber", "singlesCsvMapCondition",
  "singlesCsvMapLanguage", "singlesCsvMapCost", "singlesCsvMapQuantity", "singlesCsvMapMarketValue",
  "saveLotsToStorage", "removeSinglesPurchaseRow", "onSinglesPurchaseRowsChange", "importSinglesPurchasesCsv",
  "confirmSinglesPurchasesCsvImport", "cancelSinglesPurchasesCsvImport", "formatCurrency", "t", "notify",
  "askConfirmation"
] as const;

type SinglesConfigCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & RuntimeMethodState;
export type SinglesConfigPorts = Pick<SinglesConfigCapabilitySource, typeof singlesConfigPortKeys[number]>;

export const singlesConfigPortsKey: InjectionKey<SinglesConfigPorts> = Symbol("singlesConfigPorts");

export function createSinglesConfigPorts(source: SinglesConfigPorts): SinglesConfigPorts {
  return createCapabilityPorts(source, singlesConfigPortKeys);
}

export function useSinglesConfigPorts(): SinglesConfigPorts {
  const ports = inject(singlesConfigPortsKey, null);
  if (!ports) throw new Error("Singles configuration capabilities were not provided.");
  return ports;
}
