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

test("records one deterministic game outcome sale", async () => {
  const recorded: Array<{ lotId: number; sale: Sale }> = [];
  const sale = await settleGameOutcomeSale(input, {
    now: () => new Date(2026, 6, 21),
    nextId: () => 42,
    recordSale: (lotId, value) => { recorded.push({ lotId, sale: value }); }
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

test("uses the spin number for identity and memo while preserving singles linkage", async () => {
  let idSpinNumber: number | undefined;
  const sale = await settleGameOutcomeSale({
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

test("records nothing when the outcome does not deduct inventory", async () => {
  let recordCount = 0;
  const sale = await settleGameOutcomeSale({ ...input, deductionType: "none" }, {
    now: () => new Date(2026, 6, 21),
    nextId: () => 42,
    recordSale: () => { recordCount += 1; }
  });

  assert.equal(sale, null);
  assert.equal(recordCount, 0);
});

test("session revenue waits for a successful sale and stays unchanged on failure", async () => {
  const { settleSessionGameOutcomeSale } = await import("../src/components/windows/game/services/gameOutcomeSettlement.ts");
  for (const success of [true, false]) {
    const deferred = createDeferred<boolean>();
    const revenue = { wheelSessionNetRevenue: 5 };
    const pending = settleSessionGameOutcomeSale(input, { addWheelSaleToLot: () => deferred.promise }, revenue);
    assert.equal(revenue.wheelSessionNetRevenue, 5);
    deferred.resolve(success);
    const sale = await pending;
    assert.equal(Boolean(sale), success);
    assert.equal(revenue.wheelSessionNetRevenue, 5 + (success ? Number(sale?.netRevenue) : 0));
  }
});

test("a rejected or missing sale recorder cannot settle revenue", async () => {
  const { settleSessionGameOutcomeSale } = await import("../src/components/windows/game/services/gameOutcomeSettlement.ts");
  for (const recorder of [{}, { addWheelSaleToLot: () => Promise.reject(new Error("offline")) }]) {
    const revenue = { wheelSessionNetRevenue: 5 };
    assert.equal(await settleSessionGameOutcomeSale(input, recorder, revenue), null);
    assert.equal(revenue.wheelSessionNetRevenue, 5);
  }
});

test("a reset session ignores a late successful settlement", async () => {
  const { captureGameOutcomeGuard, invalidateGameOutcomeSettlements, settleSessionGameOutcomeSale } = await import("../src/components/windows/game/services/gameOutcomeSettlement.ts");
  const context = { activeScopeType: "personal" as const, activeWorkspaceId: null, googleAuthEpoch: 1, activeWheelConfigId: 5 };
  const deferred = createDeferred<boolean>();
  const revenue = { wheelSessionNetRevenue: 0 };
  const pending = settleSessionGameOutcomeSale(input, { addWheelSaleToLot: () => deferred.promise }, revenue, captureGameOutcomeGuard(context));
  invalidateGameOutcomeSettlements(context);
  deferred.resolve(true);
  assert.equal(await pending, null);
  assert.equal(revenue.wheelSessionNetRevenue, 0);
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("a lost response retry after reload reuses the original sale and lot", async () => {
  const { settleSessionGameOutcomeSale } = await import("../src/components/windows/game/services/gameOutcomeSettlement.ts");
  const cloud = new Map<number, Sale>();
  const attempts: Array<{ lotId: number; sale: Sale }> = [];
  let stored = "";
  const recorder = {
    wheelTotalSpins: 1,
    wheelPendingInventoryIssues: [] as import("../src/types/app.ts").PendingWheelInventoryIssue[],
    saveWheelSession() { stored = JSON.stringify(this.wheelPendingInventoryIssues); },
    async addWheelSaleToLot(lotId: number, sale: Sale) {
      assert.ok(stored.includes(String(sale.id)), "persist identity before sending");
      attempts.push({ lotId, sale });
      cloud.set(sale.id, sale);
      return attempts.length > 1; // First write succeeds but its response is lost.
    }
  };
  const revenue = { wheelSessionNetRevenue: 0 };
  assert.equal(await settleSessionGameOutcomeSale(input, recorder, revenue), null);
  const restored = { ...recorder, wheelPendingInventoryIssues: JSON.parse(stored) };
  const retryIssue = restored.wheelPendingInventoryIssues[0];
  assert.ok(retryIssue);
  const result = await settleSessionGameOutcomeSale({ ...input, lotId: 99, config: { ...config, spinPrice: 999 }, pendingIssue: retryIssue }, restored, revenue);
  assert.ok(result);
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(cloud.size, 1);
  assert.equal(revenue.wheelSessionNetRevenue, attempts[0]!.sale.netRevenue);
});

test("a sale is not sent when its retry identity cannot be persisted", async () => {
  const { settleSessionGameOutcomeSale } = await import("../src/components/windows/game/services/gameOutcomeSettlement.ts");
  let writes = 0;
  const recorder = {
    saveWheelSession() { throw new Error("quota"); },
    addWheelSaleToLot() { writes++; return Promise.resolve(true); }
  };
  assert.equal(await settleSessionGameOutcomeSale(input, recorder, { wheelSessionNetRevenue: 0 }), null);
  assert.equal(writes, 0);
});
