import { describe, expect, it } from "vitest";
import { normalizeWhatnotImportCandidate, normalizeWhatnotImportDecision, WHATNOT_SALE_TYPES, WHATNOT_CONFIRMATION_SALE_TYPES } from "../shared/whatnot-import-contracts.mjs";

describe("shared Whatnot import contracts", () => {
  it("normalizes equivalent source candidates to the same business fields and stable transaction identity", () => {
    const csv = normalizeWhatnotImportCandidate({ externalOrderId: " order-1 ", externalOrderItemId: "item-1", title: " Booster ", date: "2026-01-02", price: "10.5" });
    const oauth = normalizeWhatnotImportCandidate({ externalOrderId: "order-1", externalOrderItemId: "item-1", title: "Booster", date: "2026-01-02", price: 10.5 });
    expect(csv).toEqual(oauth);
    expect(csv.externalSaleId).toBe("order-1:item-1");
    expect(csv.quantity).toBe(1);
    expect(csv.buyerShipping).toBe(0);
    expect(csv.orderStatus).toBe("COMPLETED");
  });

  it("rejects missing identity and non-finite or negative money", () => {
    const base = { externalOrderId: "o", externalOrderItemId: "i", title: "Card", date: "2026-01-01", price: 2 };
    expect(() => normalizeWhatnotImportCandidate({ ...base, externalOrderItemId: " " })).toThrow("externalOrderItemId");
    expect(() => normalizeWhatnotImportCandidate({ ...base, price: Infinity })).toThrow("price");
    expect(() => normalizeWhatnotImportCandidate({ ...base, buyerShipping: -1 })).toThrow("buyerShipping");
  });

  it("rejects invalid dates while accepting legacy CSV and OAuth date forms", () => {
    const base = { externalOrderId: "o", externalOrderItemId: "i", title: "Card", price: 2 };
    expect(() => normalizeWhatnotImportCandidate({ ...base, date: "not-a-date" })).toThrow("date");
    expect(() => normalizeWhatnotImportCandidate({ ...base, date: "2026-02-30" })).toThrow("date");
    expect(normalizeWhatnotImportCandidate({ ...base, date: "3/25/2026" }).date).toBe("3/25/2026");
    expect(normalizeWhatnotImportCandidate({ ...base, date: "2026-03-25T13:00:00.000Z" }).date).toBe("2026-03-25T13:00:00.000Z");
  });

  it("keeps wheel in persisted mappings but excludes it from confirmation decisions", () => {
    expect(WHATNOT_SALE_TYPES).toContain("wheel");
    expect(WHATNOT_CONFIRMATION_SALE_TYPES).not.toContain("wheel");
    expect(normalizeWhatnotImportDecision({ rowId: "i", saleType: "wheel", selectedImportAction: "split_group" })).toEqual({
      rowId: "i", skip: false, lotId: null, saleType: null, packsCount: null, targetKind: null, targetSaleId: null, selectedImportAction: "split_group"
    });
  });
});
