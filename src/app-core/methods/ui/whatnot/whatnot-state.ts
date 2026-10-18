import type {
  WhatnotCsvStateContext,
  WhatnotReviewStateContext,
  WhatnotTransientStateContext
} from "../../../context/whatnot.ts";

const EMPTY_WHATNOT_CSV_IMPORT_STATE: Pick<
  WhatnotCsvStateContext,
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
> = {
  whatnotCsvRawInput: "",
  whatnotCsvSellerAccountId: "",
  whatnotCsvHeaders: [],
  whatnotCsvRows: [],
  whatnotCsvMapExternalSaleId: null,
  whatnotCsvMapOrderId: null,
  whatnotCsvMapOrderItemId: null,
  whatnotCsvMapSellerAccountId: null,
  whatnotCsvMapTitle: null,
  whatnotCsvMapListingTitle: null,
  whatnotCsvMapBuyerName: null,
  whatnotCsvMapOrderPlacedAt: null,
  whatnotCsvMapOriginalItemPrice: null,
  whatnotCsvMapSku: null,
  whatnotCsvMapProductCategory: null,
  whatnotCsvMapQuantity: null,
  whatnotCsvMapPrice: null,
  whatnotCsvMapBuyerShipping: null,
  whatnotCsvMapDate: null,
  whatnotCsvMapOrderStatus: null
};

const EMPTY_WHATNOT_REVIEW_STATE: Pick<
  WhatnotReviewStateContext,
  | "whatnotReviewBatchId"
  | "whatnotReviewRows"
  | "isConfirmingWhatnotImport"
  | "whatnotConfirmationRetryPayload"
> = {
  whatnotReviewBatchId: null,
  whatnotReviewRows: [],
  isConfirmingWhatnotImport: false,
  whatnotConfirmationRetryPayload: null
};

export function resetWhatnotCsvImportState(app: WhatnotCsvStateContext): void {
  Object.assign(app, EMPTY_WHATNOT_CSV_IMPORT_STATE);
}

export function resetWhatnotReviewState(app: WhatnotReviewStateContext): void {
  Object.assign(app, EMPTY_WHATNOT_REVIEW_STATE);
}

export function resetWhatnotTransientUiState(app: WhatnotTransientStateContext): void {
  app.showWhatnotCsvImportDialog = false;
  app.showWhatnotReviewDialog = false;
  resetWhatnotCsvImportState(app);
  resetWhatnotReviewState(app);
}

export function resetWhatnotSignedOutState(app: WhatnotTransientStateContext): void {
  app.whatnotConnectionStatus = "unconfigured";
  app.whatnotSyncStatus = "idle";
  app.whatnotConnectionSummary = null;
  app.whatnotCallbackStatus = null;
  app.whatnotCallbackMessage = "";
  resetWhatnotTransientUiState(app);
}
