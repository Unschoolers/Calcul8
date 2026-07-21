import type { AppState, WhatnotCsvPreparedRowInput } from "../../types/app.ts";
import type { ScopedApiContext } from "./api.ts";
import type { SalesEntityContext } from "./commerce.ts";
import type { FeatureMethodImplementation, RuntimeMethodState } from "./runtime.ts";
import type { SyncMethodState } from "./sync.ts";
import type { WorkspaceComputedState } from "./workspace.ts";

export interface WhatnotComputedState {
  whatnotConnectionTitle: string;
  whatnotConnectionSubtitle: string;
  whatnotConnectionIcon: string;
  whatnotConnectActionTitle: string;
  whatnotSyncActionTitle: string;
}

export type WhatnotComputedContext = Pick<
  AppState,
  | "activeScopeType"
  | "preferredLanguage"
  | "whatnotConnectionStatus"
  | "whatnotConnectionSummary"
  | "whatnotSyncStatus"
>;

export type WhatnotComputedObject = {
  [Key in keyof WhatnotComputedState]: (
    this: WhatnotComputedContext
  ) => WhatnotComputedState[Key];
};

export interface WhatnotMethodState {
  refreshWhatnotStatus(): Promise<void>;
  connectWhatnot(): Promise<void>;
  disconnectWhatnot(): Promise<void>;
  syncWhatnotSales(): Promise<void>;
  openWhatnotCsvImportDialog(): void;
  closeWhatnotCsvImportDialog(): void;
  prepareWhatnotCsvImport(rows: WhatnotCsvPreparedRowInput[], sellerAccountId?: string): Promise<boolean>;
  openWhatnotReviewDialog(): Promise<void>;
  closeWhatnotReviewDialog(): void;
  discardWhatnotReviewBatch(): void;
  confirmWhatnotImportBatch(): Promise<void>;
}

export type WhatnotScopeContext = Pick<
  AppState,
  "activeScopeType" | "activeWorkspaceId"
>;

/** Session-first transport used only by Whatnot provider requests. */
export type WhatnotHttpContext = ScopedApiContext;

export type WhatnotStatusContext = Pick<
  AppState,
  "whatnotConnectionStatus" | "whatnotConnectionSummary"
>;

export type WhatnotConnectionContext = WhatnotHttpContext &
  WhatnotScopeContext &
  WhatnotStatusContext &
  Pick<AppState, "whatnotSyncStatus"> &
  Pick<WorkspaceComputedState, "isCurrentWorkspaceOwner">;

export type WhatnotCsvStateContext = Pick<
  AppState,
  | "whatnotCsvRawInput"
  | "whatnotCsvSellerAccountId"
  | "whatnotCsvHeaders"
  | "whatnotCsvRows"
  | "whatnotCsvMapExternalSaleId"
  | "whatnotCsvMapOrderId"
  | "whatnotCsvMapOrderItemId"
  | "whatnotCsvMapSellerAccountId"
  | "whatnotCsvMapTitle"
  | "whatnotCsvMapListingTitle"
  | "whatnotCsvMapBuyerName"
  | "whatnotCsvMapOrderPlacedAt"
  | "whatnotCsvMapOriginalItemPrice"
  | "whatnotCsvMapSku"
  | "whatnotCsvMapProductCategory"
  | "whatnotCsvMapQuantity"
  | "whatnotCsvMapPrice"
  | "whatnotCsvMapBuyerShipping"
  | "whatnotCsvMapDate"
  | "whatnotCsvMapOrderStatus"
>;

export type WhatnotReviewStateContext = Pick<
  AppState,
  | "whatnotReviewBatchId"
  | "whatnotReviewRows"
  | "isConfirmingWhatnotImport"
  | "whatnotConfirmationRetryPayload"
  | "showWhatnotCsvImportDialog"
  | "showWhatnotReviewDialog"
>;

export type WhatnotReviewContext = WhatnotCsvStateContext &
  WhatnotReviewStateContext &
  Pick<RuntimeMethodState, "askConfirmation" | "notify">;

export type WhatnotTransientStateContext = WhatnotCsvStateContext &
  WhatnotReviewStateContext &
  WhatnotStatusContext &
  Pick<
    AppState,
    "whatnotSyncStatus" | "whatnotCallbackStatus" | "whatnotCallbackMessage"
  >;

export type WhatnotSalesRefreshContext = SalesEntityContext &
  Pick<AppState, "currentLotId" | "sales">;

export type WhatnotMethodContext = WhatnotConnectionContext &
  WhatnotReviewContext &
  WhatnotSalesRefreshContext &
  Pick<AppState, "preferredLanguage"> &
  Pick<SyncMethodState, "pullCloudSync"> &
  Pick<WhatnotMethodState, "refreshWhatnotStatus">;

export type WhatnotMethodImplementation = FeatureMethodImplementation<
  WhatnotMethodContext,
  WhatnotMethodState
>;
