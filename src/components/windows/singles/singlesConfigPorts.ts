import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type { RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { AppState } from "../../../types/app.ts";
import type { SinglesWindowThis } from "./SinglesConfigWindow.definition.ts";

export const singlesConfigPortKeys = [
  "currentLotId", "lots", "currentLotCatalogSource", "singlesPurchases", "singlesSoldCountByPurchaseId",
  "sellingCurrency", "exchangeRate", "preferredLanguage", "currency", "conversionInfo",
  "singlesPurchaseTotalCost", "singlesPurchaseTotalMarketValue",
  "showSinglesCsvMapperModal", "singlesCsvImportHeaders", "singlesCsvImportRows", "singlesCsvImportCurrency",
  "singlesCsvImportMode", "singlesCsvMapItem", "singlesCsvMapCardNumber", "singlesCsvMapCondition",
  "singlesCsvMapLanguage", "singlesCsvMapCost", "singlesCsvMapQuantity", "singlesCsvMapMarketValue",
  "saveLotsToStorage", "removeSinglesPurchaseRow", "onSinglesPurchaseRowsChange", "importSinglesPurchasesCsv",
  "confirmSinglesPurchasesCsvImport", "cancelSinglesPurchasesCsvImport", "formatCurrency", "t", "onPurchaseConfigChange", "notify",
  "askConfirmation"
] as const;

type SinglesConfigCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & RuntimeMethodState;
export type SinglesConfigPorts = Pick<SinglesConfigCapabilitySource, typeof singlesConfigPortKeys[number]>;

export const singlesConfigPortsKey: InjectionKey<SinglesConfigPorts> = Symbol("singlesConfigPorts");

export function createSinglesConfigPorts(source: SinglesConfigPorts): SinglesConfigPorts {
  return createCapabilityPorts(source, singlesConfigPortKeys, {
    requiredFunctions: [
      "saveLotsToStorage", "removeSinglesPurchaseRow", "onSinglesPurchaseRowsChange",
      "importSinglesPurchasesCsv", "confirmSinglesPurchasesCsvImport", "cancelSinglesPurchasesCsvImport",
      "formatCurrency", "t", "onPurchaseConfigChange", "notify", "askConfirmation"
    ]
  });
}

export function useSinglesConfigPorts(): SinglesConfigPorts {
  const ports = inject(singlesConfigPortsKey, null);
  if (!ports) throw new Error("Singles configuration capabilities were not provided.");
  return ports;
}

export const singlesPurchasingPortKeys = [
  "currency", "sellingCurrency", "exchangeRate", "conversionInfo", "onPurchaseConfigChange", "t",
  "showCatalogSuggestions", "showSinglesInfoNotice", "dismissSinglesInfoNotice", "singlesSearchQuery",
  "onSinglesSearchInput", "importSinglesPurchasesCsv", "showFullySoldSingles", "toggleShowFullySoldSingles",
  "isDesktopSelectMode", "toggleDesktopSelectMode", "visibleSinglesPurchases", "singlesPurchases",
  "hasSinglesSearchQuery", "singlesPurchaseTotalCost", "singlesPurchaseTotalMarketValue", "fmtCurrency",
  "selectedDesktopRowIds", "deleteSelectedDesktopRows", "onDesktopRowsScroll", "setDesktopRowsScrollerRef",
  "useDesktopVirtualization", "desktopTopSpacerPx", "desktopRenderedRows", "desktopBottomSpacerPx",
  "desktopSortBy", "sortIconFor", "toggleDesktopSort", "isDesktopRowSelected", "handleDesktopRowClick",
  "conditionShortLabel", "languageShortLabel", "openSinglesImagePreview", "getSinglesEntryPreviewImage",
  "isSinglesEntryFullySold", "getSinglesEntryStockLabel", "getSinglesEntryMarketTotalInSellingCurrency",
  "getSinglesEntryMarketValueInSellingCurrency", "confirmRemoveSinglesPurchaseRow", "mobileRenderedSinglesPurchases",
  "openSinglesRowEditor", "hasMoreMobileSinglesRows", "loadMoreMobileRows", "nextMobileSinglesBatchCount",
  "remainingMobileSinglesRows", "mobileSortLabel", "cycleMobileSort"
] as const satisfies readonly (keyof SinglesWindowThis)[];

const singlesPurchasingRequiredFunctionKeys = [
  "onPurchaseConfigChange", "t", "dismissSinglesInfoNotice", "onSinglesSearchInput",
  "importSinglesPurchasesCsv", "toggleShowFullySoldSingles", "toggleDesktopSelectMode",
  "deleteSelectedDesktopRows", "onDesktopRowsScroll", "setDesktopRowsScrollerRef",
  "sortIconFor", "toggleDesktopSort", "isDesktopRowSelected", "handleDesktopRowClick",
  "conditionShortLabel", "languageShortLabel", "openSinglesImagePreview", "getSinglesEntryPreviewImage",
  "isSinglesEntryFullySold", "getSinglesEntryStockLabel", "getSinglesEntryMarketTotalInSellingCurrency",
  "getSinglesEntryMarketValueInSellingCurrency", "confirmRemoveSinglesPurchaseRow", "openSinglesRowEditor",
  "loadMoreMobileRows", "cycleMobileSort", "fmtCurrency"
] as const satisfies readonly (keyof SinglesWindowThis)[];

export type SinglesPurchasingPorts = Pick<SinglesWindowThis, typeof singlesPurchasingPortKeys[number]>;
export const singlesPurchasingPortsKey: InjectionKey<SinglesPurchasingPorts> = Symbol("singlesPurchasingPorts");

export function createSinglesPurchasingPorts(source: SinglesWindowThis): SinglesPurchasingPorts {
  return createCapabilityPorts(source, singlesPurchasingPortKeys, {
    requiredFunctions: singlesPurchasingRequiredFunctionKeys
  });
}

export function useSinglesPurchasingPorts(): SinglesPurchasingPorts {
  const ports = inject(singlesPurchasingPortsKey, null);
  if (!ports) throw new Error("Singles purchasing capabilities were not provided.");
  return ports;
}
