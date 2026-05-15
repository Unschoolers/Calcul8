import type { WhatnotApp } from "./whatnot-types.ts";

const EMPTY_WHATNOT_CSV_IMPORT_STATE: Pick<
  WhatnotApp,
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
  WhatnotApp,
  | "whatnotReviewBatchId"
  | "whatnotReviewRows"
> = {
  whatnotReviewBatchId: null,
  whatnotReviewRows: []
};

export function resetWhatnotCsvImportState(app: WhatnotApp): void {
  Object.assign(app, EMPTY_WHATNOT_CSV_IMPORT_STATE);
}

export function resetWhatnotReviewState(app: WhatnotApp): void {
  Object.assign(app, EMPTY_WHATNOT_REVIEW_STATE);
}

export function resetWhatnotTransientUiState(app: WhatnotApp): void {
  app.showWhatnotCsvImportDialog = false;
  app.showWhatnotReviewDialog = false;
  resetWhatnotCsvImportState(app);
  resetWhatnotReviewState(app);
}

export function resetWhatnotSignedOutState(app: WhatnotApp): void {
  app.whatnotConnectionStatus = "unconfigured";
  app.whatnotSyncStatus = "idle";
  app.whatnotConnectionSummary = null;
  app.whatnotCallbackStatus = null;
  app.whatnotCallbackMessage = "";
  resetWhatnotTransientUiState(app);
}
