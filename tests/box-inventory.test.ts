import { describe, expect, it } from "vitest";
import assert from "node:assert/strict";
import { calculateSealedBoxInventory, deriveBoxOpeningEvents } from "../src/domain/box-inventory.ts";
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

it("automatically records the sale that opened each box at its immutable creation time", () => {
  const result = deriveBoxOpeningEvents({ boxesPurchased: 3, packsPerBox: 10 }, [
    { id: 1, type: "pack", quantity: 3, packsCount: 3, createdAt: "2026-09-29T10:00:00.000Z" },
    { id: 2, type: "box", quantity: 1, packsCount: 10, createdAt: "2026-09-29T10:02:00.000Z" },
    { id: 3, type: "rtyh", quantity: 1, packsCount: 8, createdAt: "2026-09-29T10:05:00.000Z" }
  ]);
  assert.deepEqual(result, { valid: true, events: [
    { saleId: 1, boxesOpened: 1, openedAt: "2026-09-29T10:00:00.000Z", precision: "instant" },
    { saleId: 3, boxesOpened: 1, openedAt: "2026-09-29T10:05:00.000Z", precision: "instant" }
  ] });
});

it("legacy dates are marked date-only, and editing a sale recomputes opening history", () => {
  const lot = { boxesPurchased: 2, packsPerBox: 10 };
  const original = [
    { id: 1, type: "pack", quantity: 5, packsCount: 5, date: "2026-09-29" },
    { id: 2, type: "wheel", quantity: 1, packsCount: 7, createdAt: "2026-09-30T10:00:00.000Z" }
  ];
  const result = deriveBoxOpeningEvents(lot, original);
  assert.equal(result.events[0]?.precision, "date");
  assert.equal(result.events[1]?.saleId, 2);
  const edited = deriveBoxOpeningEvents(lot, [{ ...original[0], packsCount: 0 }, original[1]]);
  assert.deepEqual(edited.events.map((event) => event.saleId), [2]);
});
