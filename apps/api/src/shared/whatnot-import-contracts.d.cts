// Generated from shared/contracts/whatnot-import-contracts.ts. Run npm run shared:generate.
export type WhatnotMappedSaleType = "pack" | "box" | "rtyh" | "wheel";
export type WhatnotConfirmationSaleType = "pack" | "box" | "rtyh";
export type WhatnotImportDecisionKind = "new" | "whatnot_mapping" | "manual_candidate";
export type WhatnotReviewImportAction = "create" | "update_existing" | "split_group" | "skip";
export interface WhatnotNormalizedImportRowInput {
    externalSaleId?: string;
    externalOrderId: string;
    externalOrderItemId: string;
    externalAccountId?: string;
    title: string;
    listingTitle?: string;
    sku?: string;
    productCategory?: string;
    buyerName?: string;
    quantity?: number;
    price: number;
    originalItemPrice?: number;
    buyerShipping?: number;
    date: string;
    orderPlacedAt?: string;
    orderPlacedAtRaw?: string;
    orderStatus?: string;
    listingId?: string;
    productId?: string;
    variantId?: string;
}
export interface WhatnotImportDecision {
    rowId: string;
    skip: boolean;
    lotId: number | null;
    saleType: WhatnotConfirmationSaleType | null;
    packsCount: number | null;
    targetKind: WhatnotImportDecisionKind | null;
    targetSaleId: string | null;
    selectedImportAction: WhatnotReviewImportAction | null;
}
declare const SALE_TYPES: readonly WhatnotMappedSaleType[];
declare const CONFIRMATION_SALE_TYPES: readonly WhatnotConfirmationSaleType[];
type WhatnotNormalizedImportCandidate = WhatnotNormalizedImportRowInput & {
    externalSaleId: string;
    quantity: number;
    buyerShipping: number;
    orderStatus: string;
};
declare function normalizeWhatnotImportCandidate(value: unknown): WhatnotNormalizedImportCandidate;
declare function normalizeWhatnotImportDecision(value: unknown): WhatnotImportDecision | null;
export { SALE_TYPES as WHATNOT_SALE_TYPES, CONFIRMATION_SALE_TYPES as WHATNOT_CONFIRMATION_SALE_TYPES, normalizeWhatnotImportCandidate, normalizeWhatnotImportDecision };
