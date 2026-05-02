import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "./auth";
import { parseSyncLotsShape, parseSyncWheelConfigs } from "./syncShape";

test("parseSyncLotsShape accepts lot payload", () => {
  const result = parseSyncLotsShape({
    lots: [{ id: 2 }],
    salesByLot: { "2": [{ id: "22" }] }
  });

  assert.deepEqual(result.lots, [{ id: 2 }]);
  assert.deepEqual(result.salesByLot, { "2": [{ id: 22 }] });
});

test("parseSyncLotsShape defaults missing salesByLot to empty object", () => {
  const result = parseSyncLotsShape({
    lots: [{ id: 2 }]
  });

  assert.deepEqual(result.lots, [{ id: 2 }]);
  assert.deepEqual(result.salesByLot, {});
});

test("parseSyncLotsShape rejects invalid shape", () => {
  assert.throws(
    () => parseSyncLotsShape({ salesByLot: {} }),
    (error: unknown) => error instanceof HttpError && error.status === 400
  );
});

test("parseSyncLotsShape rejects non-object lots and sales", () => {
  assert.throws(
    () => parseSyncLotsShape({ lots: [1] }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'lots[0]' must be an object."
  );

  assert.throws(
    () => parseSyncLotsShape({ lots: [{ id: 2 }], salesByLot: { "2": [null] } }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'salesByLot.2[0]' must be an object."
  );
});

test("parseSyncLotsShape requires lot ids at the boundary", () => {
  assert.throws(
    () => parseSyncLotsShape({ lots: [{ name: "Missing id" }] }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'lots[0].id' must be a string or number."
  );
});

test("parseSyncLotsShape rejects invalid salesByLot partition keys", () => {
  assert.throws(
    () => parseSyncLotsShape({ lots: [{ id: 2 }], salesByLot: { "bad-lot": [{ id: 1 }] } }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'salesByLot' contains invalid lot id 'bad-lot'."
  );
});

test("parseSyncLotsShape normalizes sale entity fields and drops unknown data", () => {
  const result = parseSyncLotsShape({
    lots: [{ id: 10 }],
    salesByLot: {
      "10": [
        {
          id: "501",
          type: "wheel",
          quantity: "1",
          packsCount: "2",
          price: "14.25",
          priceIsTotal: true,
          customer: " Alex ",
          memo: " Hit ",
          buyerShipping: "3.5",
          date: "2026-04-03",
          version: "7",
          updatedAt: "2026-04-03T10:00:00.000Z",
          updatedBy: "user-1",
          mutationId: "sale:1",
          linkedWheelId: "91",
          winningTierId: "tier-1",
          costOfWinningTier: "8.25",
          netRevenue: "10.75",
          singlesItems: [
            { singlesPurchaseEntryId: "801", quantity: "2", price: "4.5", extra: "drop" },
            { singlesPurchaseEntryId: "bad", quantity: 0, price: 2 }
          ],
          extraSaleField: "drop"
        }
      ]
    }
  });

  assert.deepEqual(result.salesByLot, {
    "10": [
      {
        id: 501,
        type: "wheel",
        quantity: 1,
        packsCount: 2,
        singlesItems: [
          {
            singlesPurchaseEntryId: 801,
            quantity: 2,
            price: 4.5
          }
        ],
        price: 14.25,
        priceIsTotal: true,
        customer: "Alex",
        memo: "Hit",
        buyerShipping: 3.5,
        date: "2026-04-03",
        version: 7,
        updatedAt: "2026-04-03T10:00:00.000Z",
        updatedBy: "user-1",
        mutationId: "sale:1",
        linkedWheelId: 91,
        winningTierId: "tier-1",
        costOfWinningTier: 8.25,
        netRevenue: 10.75
      }
    ]
  });
});

test("parseSyncWheelConfigs accepts object arrays and defaults missing input", () => {
  assert.deepEqual(parseSyncWheelConfigs(null), []);
  assert.deepEqual(parseSyncWheelConfigs([{ id: 91, name: "Wheel" }]), [{ id: 91, name: "Wheel" }]);
});

test("parseSyncWheelConfigs normalizes game config fields and drops unknown data", () => {
  assert.deepEqual(parseSyncWheelConfigs([
    {
      id: "91",
      name: " Grid ",
      spinPrice: "12",
      targetMargin: "40",
      gameType: "grid",
      outcomeCount: "80",
      gridCellCount: "80",
      createdAt: "2026-04-01T00:00:00.000Z",
      unknown: "drop",
      tiers: [
        {
          id: "tier-1",
          label: " Chase ",
          color: "#ffcc00",
          chancePercent: "25",
          slots: "20",
          costPerTier: "8",
          packsCount: "2",
          deductionType: "singles",
          sets: ["A", 2],
          boundLotId: "10",
          boundSinglesId: "501",
          isChase: true,
          extra: "drop"
        }
      ]
    }
  ]), [
    {
      id: 91,
      name: "Grid",
      spinPrice: 12,
      targetMargin: 40,
      gameType: "grid",
      outcomeCount: 80,
      gridCellCount: 80,
      tiers: [
        {
          id: "tier-1",
          label: "Chase",
          color: "#ffcc00",
          chancePercent: 25,
          slots: 20,
          costPerTier: 8,
          packsCount: 2,
          deductionType: "singles",
          sets: ["A"],
          boundLotId: 10,
          boundLotIds: [10],
          boundSinglesId: 501,
          isChase: true
        }
      ],
      createdAt: "2026-04-01T00:00:00.000Z"
    }
  ]);
});

test("parseSyncWheelConfigs rejects invalid entries", () => {
  assert.throws(
    () => parseSyncWheelConfigs(["bad"]),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'wheelConfigs[0]' must be an object."
  );

  assert.throws(
    () => parseSyncWheelConfigs([{ id: 91, tiers: "bad" }]),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'wheelConfigs[0].tiers' must be an array when provided."
  );
});
