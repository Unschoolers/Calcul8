import { describe, expect, it } from "vitest";
import { calculateSealedBoxInventory } from "../src/domain/box-inventory.ts";
import type { Sale } from "../src/types/app.ts";

type InventorySale = Pick<Sale, "type" | "quantity" | "packsCount">;
const lot = { boxesPurchased: 3, packsPerBox: 10 };
const pack = (quantity: number): InventorySale => ({ type: "pack", quantity, packsCount: quantity });
const box = (quantity: number): InventorySale => ({ type: "box", quantity, packsCount: quantity * 10 });

describe("sealed box inventory", () => {
  it("opens a box on the first pack sale and the next only after ten packs", () => {
    expect(calculateSealedBoxInventory(lot, [pack(1)])).toMatchObject({ valid: true, sealedBoxes: 2, openedBoxes: 1, loosePacks: 9 });
    expect(calculateSealedBoxInventory(lot, [pack(10)])).toMatchObject({ valid: true, sealedBoxes: 2, openedBoxes: 1, loosePacks: 0 });
    expect(calculateSealedBoxInventory(lot, [pack(11)])).toMatchObject({ valid: true, sealedBoxes: 1, openedBoxes: 2, loosePacks: 9 });
  });

  it("counts box sales only as sealed boxes, despite their packsCount", () => {
    expect(calculateSealedBoxInventory(lot, [box(1)])).toMatchObject({ valid: true, sealedBoxes: 2, openedBoxes: 0, loosePacks: 0 });
    expect(calculateSealedBoxInventory(lot, [box(1), pack(11)])).toMatchObject({ valid: true, sealedBoxes: 0, openedBoxes: 2, loosePacks: 9 });
  });

  it("includes RTYH and wheel consumption, regardless of sale quantity", () => {
    const sales: InventorySale[] = [
      { type: "rtyh", quantity: 1, packsCount: 6 },
      { type: "wheel", quantity: 1, packsCount: 5 }
    ];
    expect(calculateSealedBoxInventory(lot, sales)).toMatchObject({ valid: true, sealedBoxes: 1, openedBoxes: 2, loosePacks: 9 });
  });

  it("derives the count from the current sales, including edits and retries", () => {
    const sale = pack(1);
    expect(calculateSealedBoxInventory(lot, [sale])).toMatchObject({ sealedBoxes: 2 });
    expect(calculateSealedBoxInventory(lot, [sale])).toMatchObject({ sealedBoxes: 2 });
    expect(calculateSealedBoxInventory(lot, [pack(0)])).toMatchObject({ sealedBoxes: 3 });
  });

  it("rejects invalid and oversold inputs instead of publishing false stock", () => {
    expect(calculateSealedBoxInventory({ boxesPurchased: 3, packsPerBox: 0 }, [])).toMatchObject({ valid: false, error: "invalid_lot" });
    expect(calculateSealedBoxInventory(lot, [pack(31)])).toMatchObject({ valid: false, error: "oversold" });
    expect(calculateSealedBoxInventory(lot, [box(2), pack(11)])).toMatchObject({ valid: false, error: "oversold" });
    expect(calculateSealedBoxInventory(lot, [{ type: "pack", quantity: 1, packsCount: 0.5 }])).toMatchObject({ valid: false, error: "invalid_sale" });
  });
});
