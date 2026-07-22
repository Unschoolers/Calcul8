import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type { RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { AppState } from "../../../types/app.ts";

const liveWindowPortKeys = [
  "currentLotType", "livePackPrice", "liveBoxPriceSell", "liveSpotPrice", "totalPacks", "totalSpots",
  "boxesPurchased", "requiredPackPriceFromNow", "requiredBoxPriceFromNow", "requiredSpotPriceFromNow",
  "remainingPacksCount", "remainingBoxesEquivalent", "remainingSpotsEquivalent", "targetProfitPercent",
  "totalCaseCost", "totalRevenue", "liveForecastScenarios", "sellingShippingPerOrder", "singlesPurchases",
  "singlesSoldCountByPurchaseId", "effectiveLiveSinglesIds", "effectiveLiveSinglesEntries", "sellingCurrency",
  "currency", "exchangeRate", "preferredLanguage", "calculateProfit", "calculatePriceForUnits", "netFromGross",
  "addLiveSinglesSelection", "removeLiveSinglesSelection", "clearLiveSinglesSelection",
  "openConvertLiveSinglesSaleModal", "formatCurrency", "safeFixed", "t"
] as const;

type LiveCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & RuntimeMethodState;
export type LiveWindowSource = Pick<LiveCapabilitySource, typeof liveWindowPortKeys[number]>;
export type LiveWindowPorts = LiveWindowSource & {
  rootTranslate: RuntimeMethodState["t"];
  rootFormatCurrency: RuntimeMethodState["formatCurrency"];
};
export const liveWindowPortsKey: InjectionKey<LiveWindowPorts> = Symbol("liveWindowPorts");

export function createLiveWindowPorts(source: LiveWindowSource): LiveWindowPorts {
  const ports = createCapabilityPorts(source, liveWindowPortKeys) as LiveWindowPorts;
  Object.defineProperties(ports, {
    rootTranslate: { enumerable: true, value: ports.t },
    rootFormatCurrency: { enumerable: true, value: ports.formatCurrency }
  });
  return ports;
}

export function useLiveWindowPorts(): LiveWindowPorts {
  const ports = inject(liveWindowPortsKey, null);
  if (!ports) throw new Error("Live pricing capabilities were not provided.");
  return ports;
}
