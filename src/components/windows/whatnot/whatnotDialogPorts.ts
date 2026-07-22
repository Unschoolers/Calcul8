import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type { RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { WhatnotMethodState } from "../../../app-core/context/whatnot.ts";
import type { WorkspaceComputedState } from "../../../app-core/context/workspace.ts";
import type { AppState } from "../../../types/app.ts";

const whatnotDialogPortKeys = [
  "showWhatnotCsvImportDialog", "showWhatnotReviewDialog", "whatnotCsvRawInput", "whatnotCsvSellerAccountId",
  "whatnotCsvHeaders", "whatnotCsvRows", "whatnotCsvMapExternalSaleId", "whatnotCsvMapOrderId",
  "whatnotCsvMapOrderItemId", "whatnotCsvMapSellerAccountId", "whatnotCsvMapTitle", "whatnotCsvMapListingTitle",
  "whatnotCsvMapBuyerName", "whatnotCsvMapOrderPlacedAt", "whatnotCsvMapOriginalItemPrice", "whatnotCsvMapSku",
  "whatnotCsvMapProductCategory", "whatnotCsvMapQuantity", "whatnotCsvMapPrice", "whatnotCsvMapBuyerShipping",
  "whatnotCsvMapDate", "whatnotCsvMapOrderStatus", "whatnotReviewRows", "isConfirmingWhatnotImport",
  "activeScopeType", "whatnotConnectionSummary", "currentWorkspaceName", "isCurrentWorkspaceOwner", "lotItems",
  "closeWhatnotCsvImportDialog", "prepareWhatnotCsvImport", "closeWhatnotReviewDialog", "discardWhatnotReviewBatch",
  "confirmWhatnotImportBatch", "loadSalesForLotId", "formatCurrency", "formatDate", "notify", "t"
] as const;

type WhatnotDialogCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & RuntimeMethodState
  & WhatnotMethodState & WorkspaceComputedState;
export type WhatnotDialogPorts = Pick<WhatnotDialogCapabilitySource, typeof whatnotDialogPortKeys[number]>;
export const whatnotDialogPortsKey: InjectionKey<WhatnotDialogPorts> = Symbol("whatnotDialogPorts");

export function createWhatnotDialogPorts(source: WhatnotDialogPorts): WhatnotDialogPorts {
  return createCapabilityPorts(source, whatnotDialogPortKeys);
}

export function useWhatnotDialogPorts(): WhatnotDialogPorts {
  const ports = inject(whatnotDialogPortsKey, null);
  if (!ports) throw new Error("Whatnot dialog capabilities were not provided.");
  return ports;
}
