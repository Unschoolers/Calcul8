export interface PlayPurchase {
  productId: string;
  purchaseToken: string;
  state: "purchased" | "pending";
}

export type PlayBillingErrorCode =
  | "cancelled"
  | "already_owned"
  | "disconnected"
  | "not_available"
  | "product_unavailable"
  | "purchase_in_flight"
  | "purchase_pending"
  | "unknown";

export class PlayBillingError extends Error {
  constructor(
    public readonly code: PlayBillingErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PlayBillingError";
  }
}

export interface PlayBillingPort {
  isAvailable(): Promise<boolean>;
  listPurchases(): Promise<PlayPurchase[]>;
  purchase(productId: string): Promise<PlayPurchase>;
}
