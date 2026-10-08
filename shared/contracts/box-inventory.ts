export type BoxLot = { boxesPurchased: number; packsPerBox: number };
export type InventorySale = { type: string; quantity: number; packsCount: number };
export type SaleConsumptionLot = Partial<BoxLot> & { lotType?: "bulk" | "singles" };
export type SaleConsumptionInput = InventorySale & { singlesItems?: readonly { quantity: number }[] };
export type SaleConsumption = {
  units: number;
  sealedBoxes: number;
  openedPacks: number;
  valid: boolean;
  error?: "invalid_lot" | "invalid_sale";
};
export type SealedBoxInventory = {
  sealedBoxes: number;
  openedBoxes: number;
  loosePacks: number;
  valid: boolean;
  error?: "invalid_lot" | "invalid_sale" | "oversold";
};

export type BoxOpeningEvent = { saleId: number | null; boxesOpened: number; openedAt: string | null; precision: "instant" | "date" | "unknown" };
function invalid(error: NonNullable<SealedBoxInventory["error"]>) {
  return { sealedBoxes: 0, openedBoxes: 0, loosePacks: 0, valid: false, error };
}

function invalidConsumption(error: NonNullable<SaleConsumption["error"]>): SaleConsumption {
  return { units: 0, sealedBoxes: 0, openedPacks: 0, valid: false, error };
}

/** Resolve the physical inventory represented by a persisted sale without changing its stored shape. */
function calculateSaleConsumption(lot: SaleConsumptionLot, sale: SaleConsumptionInput): SaleConsumption {
  if (!Number.isSafeInteger(sale.quantity) || sale.quantity < 0 || !Number.isSafeInteger(sale.packsCount) || sale.packsCount < 0) {
    return invalidConsumption("invalid_sale");
  }
  if (lot.lotType === "singles") {
    let units = sale.quantity;
    if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
      units = 0;
      for (const item of sale.singlesItems) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) return invalidConsumption("invalid_sale");
        units += item.quantity;
        if (!Number.isSafeInteger(units)) return invalidConsumption("invalid_sale");
      }
    }
    return { units, sealedBoxes: 0, openedPacks: 0, valid: true };
  }
  if (sale.type === "box" && lot.packsPerBox !== undefined) {
    if (!Number.isSafeInteger(lot.packsPerBox) || lot.packsPerBox <= 0) return invalidConsumption("invalid_lot");
    // Manual/historical box rows already carry their sold pack count. Shopify rows
    // intentionally persist zero, so derive only that missing physical count.
    const units = sale.packsCount > 0 ? sale.packsCount : sale.quantity * lot.packsPerBox;
    if (!Number.isSafeInteger(units)) return invalidConsumption("invalid_sale");
    return { units, sealedBoxes: sale.quantity, openedPacks: 0, valid: true };
  }
  return sale.type === "box"
    ? { units: sale.packsCount, sealedBoxes: sale.quantity, openedPacks: 0, valid: true }
    : { units: sale.packsCount, sealedBoxes: 0, openedPacks: sale.packsCount, valid: true };
}

function calculateSealedBoxInventory(lot: BoxLot, sales: readonly InventorySale[]): SealedBoxInventory {
  const { boxesPurchased, packsPerBox } = lot;
  if (!Number.isSafeInteger(boxesPurchased) || boxesPurchased < 0 || !Number.isSafeInteger(packsPerBox) || packsPerBox <= 0) {
    return invalid("invalid_lot");
  }
  let boxesSold = 0;
  let packsConsumed = 0;
  for (const sale of sales) {
    const consumption = calculateSaleConsumption(lot, sale);
    if (!consumption.valid) return invalid("invalid_sale");
    boxesSold += consumption.sealedBoxes;
    packsConsumed += consumption.openedPacks;
    if (!Number.isSafeInteger(boxesSold) || !Number.isSafeInteger(packsConsumed)) return invalid("invalid_sale");
  }
  const openedBoxes = Math.ceil(packsConsumed / packsPerBox);
  const sealedBoxes = boxesPurchased - boxesSold - openedBoxes;
  if (sealedBoxes < 0) return invalid("oversold");
  return { sealedBoxes, openedBoxes, loosePacks: openedBoxes * packsPerBox - packsConsumed, valid: true };
}
function deriveBoxOpeningEvents(lot: BoxLot, sales: readonly (InventorySale & { id?: number; date?: string; createdAt?: string })[]): { valid: true; events: BoxOpeningEvent[] } | { valid: false; events: []; error: "invalid_lot" | "invalid_sale" | "oversold" } {
  const initial = calculateSealedBoxInventory(lot, sales);
  if (!initial.valid) return { valid: false, events: [], error: initial.error! };
  const sorted = [...sales].sort((a, b) => {
    const aTime = a.createdAt || a.date || "";
    const bTime = b.createdAt || b.date || "";
    return aTime.localeCompare(bTime) || (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  let sealed = lot.boxesPurchased;
  let loose = 0;
  const events: BoxOpeningEvent[] = [];
  for (const sale of sorted) {
    if (sale.type === "box") { sealed -= sale.quantity; continue; }
    const consumption = calculateSaleConsumption(lot, sale);
    if (!consumption.valid) return { valid: false, events: [], error: "invalid_sale" };
    const needed = consumption.openedPacks;
    if (needed > loose) {
      const boxesOpened = Math.ceil((needed - loose) / lot.packsPerBox);
      sealed -= boxesOpened;
      loose += boxesOpened * lot.packsPerBox;
      events.push({ saleId: sale.id ?? null, boxesOpened,
        openedAt: sale.createdAt || sale.date || null,
        precision: sale.createdAt ? "instant" : sale.date ? "date" : "unknown" });
    }
    loose -= needed;
    if (sealed < 0) return { valid: false, events: [], error: "oversold" };
  }
  return { valid: true, events };
}
export { calculateSaleConsumption, calculateSealedBoxInventory, deriveBoxOpeningEvents };
