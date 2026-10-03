import type { ProductDetailsDraft, FieldOutcome, DraftCreateMutation } from "../../shared/shopify-product-manager";

export type ShopifyOperationIdentity = {
  scopeKey: string; shop: string; lotId: number; operationId: string; fingerprint: string;
  generation: number; bindingVersion: string | null; updatedAt: string; version?: string;
};
export type DetailsAttempt = ShopifyOperationIdentity & {
  kind: "details"; productId: string; variantId: string; inventoryItemId: string; locationId: string;
  expected: ProductDetailsDraft; draft: ProductDetailsDraft; currency: string;
  outcome: { title: FieldOutcome; price: FieldOutcome };
  attemptedFields?: ("title" | "price")[];
  terminalConflict?: boolean;
};
export type CreateAttempt = ShopifyOperationIdentity & {
  kind: "create"; handle: string; ownershipHash: string;
  request?: DraftCreateMutation;
  payload: { title: string; price: string; currency: string; sku: string; quantity: number; locationId: string; locationName: string; variantTitle: "Booster box" };
  status: "prepared" | "unknown" | "created" | "mapped" | "failed";
  ids?: { productId: string; variantId: string; inventoryItemId: string };
};
export type ShopifyOperation = DetailsAttempt | CreateAttempt;
export type ShopifyOperationStore = {
  get(scopeKey: string, lotId: number, operationId: string): Promise<ShopifyOperation | null>;
  list(scopeKey: string, lotId: number): Promise<ShopifyOperation[]>;
  put(record: ShopifyOperation): Promise<ShopifyOperation>;
};
