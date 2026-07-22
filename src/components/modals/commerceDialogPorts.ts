import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../app-core/context/commerce.ts";
import type { EntitlementMethodState } from "../../app-core/context/entitlements.ts";
import type { PortfolioComputedState, PortfolioMethodState } from "../../app-core/context/portfolio.ts";
import type { AppVueContext, RuntimeMethodState } from "../../app-core/context/runtime.ts";
import type { AppState } from "../../types/app.ts";

const commerceDialogPortKeys = [
  "showProfitCalculator", "targetProfitPercent", "hasProAccess", "isVerifyingPurchase", "showManualPurchaseVerify",
  "showAddSaleModal", "editingSale", "newSale", "showPortfolioReportModal", "portfolioReportExpandedLotIds",
  "currentLotType", "hasLotSelected", "canUsePaidActions", "singlesSaleCardOptions", "saleEditorLineProfitPreviews",
  "saleEditorProfitPreview", "allLotPerformance", "hasPortfolioData", "calculateOptimalPrices", "onSinglesSaleLineCardSelectionChange",
  "getSinglesSaleLineMaxQuantity", "onSinglesSaleLineQuantityChange", "onSinglesSaleLinePriceChange", "removeSinglesSaleLine",
  "addSinglesSaleLine", "onNewSaleTypeChange", "cancelSale", "saveSale", "togglePortfolioReportLot",
  "copyPortfolioReportTable", "savePortfolioReportTable", "startProPurchase", "openVerifyPurchaseModal",
  "formatCurrency", "formatDate", "t", "$vuetify"
] as const;

type CommerceDialogCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & EntitlementMethodState
  & PortfolioComputedState & PortfolioMethodState & RuntimeMethodState & AppVueContext;
export type CommerceDialogPorts = Pick<CommerceDialogCapabilitySource, typeof commerceDialogPortKeys[number]>;
export const commerceDialogPortsKey: InjectionKey<CommerceDialogPorts> = Symbol("commerceDialogPorts");

export function createCommerceDialogPorts(source: CommerceDialogPorts): CommerceDialogPorts {
  return createCapabilityPorts(source, commerceDialogPortKeys);
}

export function useCommerceDialogPorts(): CommerceDialogPorts {
  const ports = inject(commerceDialogPortsKey, null);
  if (!ports) throw new Error("Commerce dialog capabilities were not provided.");
  return ports;
}
