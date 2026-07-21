import assert from "node:assert/strict";
import { test } from "vitest";
import type { Lot, Sale, WheelConfig } from "../src/types/app.ts";
import {
  settleGameOutcomeSale,
  type GameOutcomeSaleInput
} from "../src/components/windows/game/services/gameOutcomeSettlement.ts";

const config = {
  id: 5,
  name: "Game",
  spinPrice: 12,
  targetMargin: 25,
  tiers: [],
  createdAt: "2026-07-20"
} satisfies WheelConfig;

const lot = {
  id: 7,
  sellingShippingPerOrder: 2,
  sellingTaxPercent: 13,
  platformFeePercent: 8,
  additionalFeePercent: 2.9,
  additionalFeeAppliesTo: "sale_plus_shipping",
  fixedFeePerOrder: 0.3
} as Lot;

const input = {
  config,
  tierId: "tier-1",
  cost: 3,
  packsCount: 2,
  deductionType: "packs",
  label: "Prize",
  lotId: 7,
  lots: [lot]
} satisfies GameOutcomeSaleInput;

test("records one deterministic game outcome sale", () => {
  const recorded: Array<{ lotId: number; sale: Sale }> = [];
  const sale = settleGameOutcomeSale(input, {
    now: () => new Date(2026, 6, 21),
    nextId: () => 42,
    recordSale: (lotId, value) => recorded.push({ lotId, sale: value })
  });

  assert.deepEqual(sale, {
    id: 42,
    type: "wheel",
    quantity: 2,
    packsCount: 2,
    price: 12,
    buyerShipping: 2,
    date: "2026-07-21",
    memo: "Wheel spin: Prize",
    linkedWheelId: 5,
    winningTierId: "tier-1",
    costOfWinningTier: 3,
    netRevenue: sale?.netRevenue
  });
  assert.deepEqual(recorded, [{ lotId: 7, sale }]);
  assert.ok(Number.isFinite(sale?.netRevenue));
});

test("uses the spin number for identity and memo while preserving singles linkage", () => {
  let idSpinNumber: number | undefined;
  const sale = settleGameOutcomeSale({
    ...input,
    deductionType: "singles",
    singlesEntryId: 91,
    spinNumber: 8
  }, {
    now: () => new Date(2026, 6, 21),
    nextId: (spinNumber) => {
      idSpinNumber = spinNumber;
      return 50;
    },
    recordSale: () => undefined
  });

  assert.equal(idSpinNumber, 8);
  assert.equal(sale?.quantity, 1);
  assert.equal(sale?.singlesPurchaseEntryId, 91);
  assert.equal(sale?.memo, "Wheel spin #8: Prize");
});

test("records nothing when the outcome does not deduct inventory", () => {
  let recordCount = 0;
  const sale = settleGameOutcomeSale({ ...input, deductionType: "none" }, {
    now: () => new Date(2026, 6, 21),
    nextId: () => 42,
    recordSale: () => { recordCount += 1; }
  });

  assert.equal(sale, null);
  assert.equal(recordCount, 0);
});
