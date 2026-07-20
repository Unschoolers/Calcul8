import type { WhatnotCsvPreparedRowInput } from "../../types/app.ts";

export interface WhatnotComputedState {
  whatnotConnectionTitle: string;
  whatnotConnectionSubtitle: string;
  whatnotConnectionIcon: string;
  whatnotConnectActionTitle: string;
  whatnotSyncActionTitle: string;
}

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
