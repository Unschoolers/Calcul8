import { describe, expect, it } from "vitest";
import { getWhatnotCommissionPercent, getWhatnotPeriod, getWhatnotTier } from "../src/domain/whatnot-fees";
import type { WhatnotVertical } from "../src/types/app";

describe("Whatnot Canadian commission schedule", () => {
  it("returns every published rate for each vertical and tier", () => {
    const rows: Record<WhatnotVertical, number[]> = {
      sports: [8, 7.75, 7.5, 7.25, 7, 6.75, 6.5],
      tcg: [8, 7.75, 7.5, 7.25, 7, 6.75, 6.5],
      fashion: [8, 7, 6.5, 5.5, 5, 4.5, 4.5],
      other_collectibles: [8, 7.25, 6.5, 6, 5, 5, 5],
      coins: [4, 3.9, 3.8, 3.7, 3.6, 3.55, 3.5],
      other: [8, 7, 6.5, 5.5, 4, 4, 4]
    };
    for (const [vertical, rates] of Object.entries(rows) as [WhatnotVertical, number[]][]) {
      rates.forEach((rate, tier) => expect(getWhatnotCommissionPercent(vertical, tier as 0 | 1 | 2 | 3 | 4 | 5 | 6)).toBe(rate));
    }
  });

  it("selects tiers at the exact CAD thresholds", () => {
    expect(getWhatnotTier(9999.99)).toBe(0);
    expect(getWhatnotTier(10000)).toBe(1);
    expect(getWhatnotTier(19999.99)).toBe(1);
    expect(getWhatnotTier(20000)).toBe(2);
    expect(getWhatnotTier(35000)).toBe(3);
    expect(getWhatnotTier(50000)).toBe(4);
    expect(getWhatnotTier(65000)).toBe(5);
    expect(getWhatnotTier(85000)).toBe(6);
  });
});

describe("Whatnot fixed 28-day periods", () => {
  it("returns the active and preceding date-only windows", () => {
    expect(getWhatnotPeriod("2026-09-21")).toEqual({
      start: "2026-09-21", endExclusive: "2026-10-19",
      previousStart: "2026-08-24", previousEndExclusive: "2026-09-21"
    });
    expect(getWhatnotPeriod("2026-10-19")).toEqual({
      start: "2026-10-19", endExclusive: "2026-11-16",
      previousStart: "2026-09-21", previousEndExclusive: "2026-10-19"
    });
  });

  it("rejects malformed, impossible, and pre-rollout dates", () => {
    expect(getWhatnotPeriod("2026-02-30")).toBeNull();
    expect(getWhatnotPeriod("09/21/2026")).toBeNull();
    expect(getWhatnotPeriod("2026-09-20")).toBeNull();
    expect(getWhatnotPeriod("9999-12-31")).toBeNull();
  });
});
