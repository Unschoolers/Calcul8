import { describe, expect, it } from "vitest";
import { resolveEffectiveWhatnotFeeInput, summarizeWhatnotFeePeriod } from "../src/app-core/shared/whatnot-fee-summary.ts";
import { calculateNetFromGross } from "../src/domain/calculations.ts";

const lot = (overrides: Record<string, unknown> = {}) => ({
  id: 1, feeProfilePreset: "whatnot", currency: "CAD", sellingCurrency: "CAD", exchangeRate: 1,
  ...overrides
});
const sale = (overrides: Record<string, unknown> = {}) => ({
  id: 1, type: "pack", quantity: 1, packsCount: 1, price: 10, buyerShipping: 0, date: "2026-08-24",
  ...overrides
});

describe("scope-wide Whatnot period summary", () => {
  it("counts current Whatnot lots and legacy unmarked sales, using total price once", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1 }), lot({ id: 2, feeProfilePreset: "none" })],
      salesByLotId: new Map([[1, [sale({ price: 100, quantity: 4, priceIsTotal: true })]], [2, [sale({ id: 2, price: 50, externalProvider: "whatnot", date: "2026-08-25" })]]]),
      dateOnly: "2026-09-21", missingLotIds: []
    });
    expect(result.previousPeriodGrossCad).toBe(150);
    expect(result.currentTier).toBe(0);
    expect(result.isEstimate).toBe(true);
  });

  it("treats legacy wheel sale price as one spin regardless of prize quantity", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1 })],
      salesByLotId: new Map([[1, [sale({
        type: "wheel", quantity: 3, packsCount: 3, price: 5000, date: "2026-09-22"
      })]]]),
      dateOnly: "2026-10-19", missingLotIds: []
    });
    expect(result.previousPeriodGrossCad).toBe(5000);
    expect(result.currentTier).toBe(0);
  });

  it("prioritizes imported provider and explicit provenance over the current lot profile", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1, feeProfilePreset: "none" })],
      salesByLotId: new Map([[1, [
        sale({ id: 1, price: 10000, externalProvider: "whatnot" }),
        sale({ id: 2, price: 20000, externalProvider: "other", wasWhatnotSale: true }),
        sale({ id: 3, price: 30000, externalProvider: undefined, wasWhatnotSale: false })
      ]]]),
      dateOnly: "2026-09-21", missingLotIds: []
    });
    expect(result.previousPeriodGrossCad).toBe(10000);
    expect(result.currentTier).toBe(1);
  });

  it("counts Whatnot transaction refs on a merged sale despite a false manual marker, but respects explicit other providers", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1, feeProfilePreset: "none" })],
      salesByLotId: new Map([[1, [
        sale({
          id: 1, price: 10000, wasWhatnotSale: false,
          externalTransactionRefs: [{
            provider: "whatnot", ledgerTransactionId: "ledger", orderId: "order", orderItemId: "item"
          }]
        }),
        sale({
          id: 2, price: 20000, wasWhatnotSale: false, externalProvider: "other",
          externalTransactionRefs: [{
            provider: "whatnot", ledgerTransactionId: "ledger-2", orderId: "order-2", orderItemId: "item-2"
          }]
        })
      ]]]),
      dateOnly: "2026-09-21", missingLotIds: []
    });
    expect(result.previousPeriodGrossCad).toBe(10000);
    expect(result.currentTier).toBe(1);
  });

  it("converts USD with a valid lot rate and skips malformed dates or conversion rates", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1, sellingCurrency: "USD", exchangeRate: 1.35 }), lot({ id: 2, sellingCurrency: "USD", exchangeRate: 0 })],
      salesByLotId: new Map([[1, [
        sale({ price: 8000, wasWhatnotSale: true }),
        sale({ id: 2, price: 8000, date: "2026-02-30", wasWhatnotSale: true })
      ]], [2, [sale({ id: 3, price: 9000, wasWhatnotSale: true })]]]),
      dateOnly: "2026-09-21", missingLotIds: []
    });
    expect(result.previousPeriodGrossCad).toBe(10800);
    expect(result.currentTier).toBe(1);
  });

  it("marks a scope incomplete when any lot cache is absent, including current-period totals", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1 })],
      salesByLotId: new Map([[1, [
        sale({ wasWhatnotSale: true }),
        sale({ id: 2, date: "2026-09-22", price: 15000, wasWhatnotSale: true })
      ]]]),
      dateOnly: "2026-09-21", missingLotIds: [2]
    });
    expect(result.isEstimate).toBe(true);
    expect(result.missingLotIds).toEqual([2]);
    expect(result.previousPeriodGrossCad).toBe(10);
    expect(result.currentPeriodGrossCad).toBe(15000);
    expect(result.nextThresholdCad).toBe(20000);
  });

  it("keeps the active tier locked to the prior period and excludes lots outside this scope", () => {
    const result = summarizeWhatnotFeePeriod({
      lots: [lot({ id: 1 })],
      salesByLotId: new Map([
        [1, [
          sale({ id: 1, price: 20000, wasWhatnotSale: true }),
          sale({ id: 2, price: 90000, date: "2026-09-22", wasWhatnotSale: true })
        ]],
        [99, [sale({ id: 3, price: 85000, wasWhatnotSale: true })]]
      ]),
      dateOnly: "2026-09-22", missingLotIds: []
    });
    expect(result.currentTier).toBe(2);
    expect(result.currentPeriodGrossCad).toBe(90000);
  });
});

describe("effective Whatnot fee input", () => {
  const summary = (currentTier: 0 | 1 | 2 | 3 | 4 | 5 | 6) => ({ currentTier, periodStart: "2026-09-21" });

  it("uses the locked Standard coins commission and preserves processing fields without mutating the lot", () => {
    const original = { ...lot({ whatnotVertical: "coins", platformFeePercent: 8, additionalFeePercent: 2.9, fixedFeePerOrder: 0.3 }) };
    const effective = resolveEffectiveWhatnotFeeInput(original, summary(0));
    expect(effective.platformFeePercent).toBe(4);
    expect(effective.additionalFeePercent).toBe(2.9);
    expect(effective.fixedFeePerOrder).toBe(0.3);
    expect(original.platformFeePercent).toBe(8);
    expect(effective).not.toBe(original);
  });

  it("reads processing fields explicitly when the input proxy does not enumerate them", () => {
    const values = {
      feeProfilePreset: "whatnot" as const,
      whatnotVertical: "coins" as const,
      platformFeePercent: 8,
      additionalFeePercent: 1.5,
      additionalFeeAppliesTo: "sale_plus_shipping" as const,
      fixedFeePerOrder: 0.05
    };
    const optionsApiLike = new Proxy(values, {
      ownKeys: () => ["_"] as (keyof typeof values)[],
      getOwnPropertyDescriptor: (_target, key) => key === "_"
        ? { configurable: true, enumerable: true, value: {} }
        : undefined
    });
    const effective = resolveEffectiveWhatnotFeeInput(optionsApiLike, summary(0));
    expect(effective.platformFeePercent).toBe(4);
    expect(effective.additionalFeePercent).toBe(1.5);
    expect(effective.additionalFeeAppliesTo).toBe("sale_plus_shipping");
    expect(effective.fixedFeePerOrder).toBe(0.05);
    expect(calculateNetFromGross(100, 0, 0, 1, effective)).toBe(94.45);
  });

  it("uses a tiered TCG rate for a classified Whatnot lot", () => {
    expect(resolveEffectiveWhatnotFeeInput(lot({ whatnotVertical: "tcg", platformFeePercent: 8 }), summary(2)).platformFeePercent).toBe(7.5);
  });

  it("leaves none and unclassified legacy inputs unchanged", () => {
    const none = lot({ feeProfilePreset: "none", whatnotVertical: "coins", platformFeePercent: 0 });
    const legacy = lot({ whatnotVertical: null, platformFeePercent: 6.25 });
    expect(resolveEffectiveWhatnotFeeInput(none, summary(0))).toBe(none);
    expect(resolveEffectiveWhatnotFeeInput(none, summary(6)).platformFeePercent).toBe(0);
    expect(resolveEffectiveWhatnotFeeInput(legacy, summary(6))).toBe(legacy);
  });

  it("leaves classified lots on legacy rates before rollout", () => {
    const beforeRollout = summarizeWhatnotFeePeriod({ lots: [], salesByLotId: new Map(), dateOnly: "2026-09-20", missingLotIds: [] });
    expect(resolveEffectiveWhatnotFeeInput(lot({ whatnotVertical: "coins", platformFeePercent: 8 }), beforeRollout).platformFeePercent).toBe(8);
  });
});
