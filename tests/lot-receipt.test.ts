import { describe, expect, it } from "vitest";
import { isLotAwaitingReceipt, normalizeExpectedReceiptDate } from "../src/shared/lot-receipt.ts";

describe("lot receipt", () => {
  it("normalizes absent and blank dates as received", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(normalizeExpectedReceiptDate(value)).toBe("");
    }
  });

  it("preserves real calendar dates, including leap days", () => {
    expect(normalizeExpectedReceiptDate(" 2028-02-29 ")).toBe("2028-02-29");
    expect(normalizeExpectedReceiptDate("2026-11-03")).toBe("2026-11-03");
  });

  it("rejects invalid dates rather than marking a lot as received", () => {
    for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-01-00", "10/25/2026", 123, {}]) {
      expect(() => normalizeExpectedReceiptDate(value)).toThrow(RangeError);
    }
  });

  it("keeps an overdue or malformed nonempty date awaiting until explicitly cleared", () => {
    expect(isLotAwaitingReceipt({ expectedReceiptDate: "2020-01-01" })).toBe(true);
    expect(isLotAwaitingReceipt({ expectedReceiptDate: "invalid legacy value" })).toBe(true);
    expect(isLotAwaitingReceipt({ expectedReceiptDate: "" })).toBe(false);
    expect(isLotAwaitingReceipt({})).toBe(false);
  });
});
