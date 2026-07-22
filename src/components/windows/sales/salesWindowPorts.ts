import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";
import type { BuyerMethodState } from "../../../app-core/context/buyers.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type { AppVueContext, RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { AppState } from "../../../types/app.ts";

const salesWindowPortKeys = [
  "currentLotId", "lots", "salesByLotId", "currentLotType", "packsPerBox", "sales", "chartView",
  "salesProgress", "salesStatus", "soldPacksCount", "totalCaseCost", "totalPacks", "singlesTrackedSoldCount",
  "singlesTrackedTotalCount", "sortedSales", "liveForecastScenarios", "calculateSaleProfit", "getSaleProfitPreview",
  "getSaleColor", "getSaleIcon", "formatDate", "toggleChartView", "getBuyerProfile", "formatCurrency", "t", "$vuetify"
] as const;

type SalesCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & BuyerMethodState & RuntimeMethodState & AppVueContext;
export type SalesWindowPorts = Pick<SalesCapabilitySource, typeof salesWindowPortKeys[number]>;
export const salesWindowPortsKey: InjectionKey<SalesWindowPorts> = Symbol("salesWindowPorts");

export function createSalesWindowPorts(source: SalesWindowPorts): SalesWindowPorts {
  return createCapabilityPorts(source, salesWindowPortKeys);
}

export function useSalesWindowPorts(): SalesWindowPorts {
  const ports = inject(salesWindowPortsKey, null);
  if (!ports) throw new Error("Sales capabilities were not provided.");
  return ports;
}
