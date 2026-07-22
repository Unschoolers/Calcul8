import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type { RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { WorkspaceComputedState } from "../../../app-core/context/workspace.ts";
import type { AppState } from "../../../types/app.ts";

const configWindowPortKeys = [
  "activeScopeType", "activeWorkspaceId", "adminImportSourceUserId", "adminImportSourceWorkspaceId",
  "boxesPurchased", "costInputMode", "currency", "hasProAccess", "includeTax", "isAdminImportInProgress",
  "packsPerBox", "purchaseDate", "purchaseShippingCostCAD", "purchaseTaxPercent", "purchaseUiMode",
  "sellingCurrency", "conversionInfo", "currentWorkspaceName", "purchaseCostInputValue", "totalCaseCost", "totalPacks",
  "canUseAdminLotSyncTools", "formatDate", "importLotsFromUserId", "formatCurrency", "t"
] as const;

type ConfigCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & RuntimeMethodState & WorkspaceComputedState;
export type ConfigWindowPorts = Pick<ConfigCapabilitySource, typeof configWindowPortKeys[number]>;

export const configWindowPortsKey: InjectionKey<ConfigWindowPorts> = Symbol("configWindowPorts");

export function createConfigWindowPorts(source: ConfigWindowPorts): ConfigWindowPorts {
  return createCapabilityPorts(source, configWindowPortKeys);
}

export function useConfigWindowPorts(): ConfigWindowPorts {
  const ports = inject(configWindowPortsKey, null);
  if (!ports) throw new Error("Configuration capabilities were not provided.");
  return ports;
}
