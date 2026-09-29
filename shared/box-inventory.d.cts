export type BoxLot = { boxesPurchased: number; packsPerBox: number };
export type InventorySale = { type: string; quantity: number; packsCount: number };
export type SealedBoxInventory = {
  sealedBoxes: number;
  openedBoxes: number;
  loosePacks: number;
  valid: boolean;
  error?: "invalid_lot" | "invalid_sale" | "oversold";
};
export declare function calculateSealedBoxInventory(lot: BoxLot, sales: readonly InventorySale[]): SealedBoxInventory;
