// Generated from shared/contracts/box-inventory.ts. Run npm run shared:generate.
export type BoxLot = {
    boxesPurchased: number;
    packsPerBox: number;
};
export type InventorySale = {
    type: string;
    quantity: number;
    packsCount: number;
};
export type SealedBoxInventory = {
    sealedBoxes: number;
    openedBoxes: number;
    loosePacks: number;
    valid: boolean;
    error?: "invalid_lot" | "invalid_sale" | "oversold";
};
export type BoxOpeningEvent = {
    saleId: number | null;
    boxesOpened: number;
    openedAt: string | null;
    precision: "instant" | "date" | "unknown";
};
declare function calculateSealedBoxInventory(lot: BoxLot, sales: readonly InventorySale[]): SealedBoxInventory;
declare function deriveBoxOpeningEvents(lot: BoxLot, sales: readonly (InventorySale & {
    id?: number;
    date?: string;
    createdAt?: string;
})[]): {
    valid: true;
    events: BoxOpeningEvent[];
} | {
    valid: false;
    events: [];
    error: "invalid_lot" | "invalid_sale" | "oversold";
};
export { calculateSealedBoxInventory, deriveBoxOpeningEvents };
