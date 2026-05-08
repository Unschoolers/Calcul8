import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCloudSnapshot } from "../src/app-core/methods/ui/sync/sync-apply.ts";
import { createSyncPayload } from "../src/app-core/methods/ui/sync/sync-payload.ts";
import {
  normalizeSyncLivePricingDto,
  parseSyncSnapshotDto,
  toSyncLotDtos,
  toSyncSalesByLotDto,
  toSyncWheelConfigDtos
} from "../src/app-core/methods/ui/sync/sync-contracts.ts";

test("sync contract helpers keep only entity records with usable ids", () => {
  assert.deepEqual(toSyncLotDtos([
    { id: "12", name: "Cloud lot" },
    { id: "not-a-number", name: "Broken lot" },
    null,
    "bad"
  ]), [{ id: 12, name: "Cloud lot" }]);

  assert.deepEqual(toSyncSalesByLotDto({
    "12": [{ id: 1, price: 10 }, null, "bad"],
    "13": "bad"
  }), {
    "12": [{ id: 1, price: 10 }]
  });

  assert.deepEqual(toSyncWheelConfigDtos([
    { id: 91, name: "Wheel" },
    null,
    "bad"
  ]), [{ id: 91, name: "Wheel" }]);
});

test("parseSyncSnapshotDto requires shaped sales and wheel collections", () => {
  const valid = parseSyncSnapshotDto({
    lots: [{ id: 1 }],
    salesByLot: { "1": [{ id: 11 }] },
    wheelConfigs: [],
    activeWheelConfigId: "91",
    version: "3"
  });
  assert.equal(valid.hasRequiredCollections, true);
  assert.equal(valid.snapshot.activeWheelConfigId, 91);
  assert.equal(valid.snapshot.version, 3);

  const invalidSales = parseSyncSnapshotDto({
    lots: [{ id: 1 }],
    salesByLot: { "1": "bad" },
    wheelConfigs: [],
    version: 4
  });
  assert.equal(invalidSales.hasRequiredCollections, false);

  const invalidWheels = parseSyncSnapshotDto({
    lots: [{ id: 1 }],
    salesByLot: {},
    wheelConfigs: [null],
    version: 4
  });
  assert.equal(invalidWheels.hasRequiredCollections, false);
});

test("parseCloudSnapshot does not report malformed entity snapshots as syncable data", () => {
  assert.deepEqual(parseCloudSnapshot({
    lots: [{ name: "No id" }],
    salesByLot: {},
    wheelConfigs: [],
    version: 8
  }), {
    lots: [],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 8,
    hasData: false
  });

  assert.equal(parseCloudSnapshot({
    lots: [{ id: 1 }],
    salesByLot: { "1": "bad" },
    wheelConfigs: [],
    version: 9
  }).hasData, false);
});

test("createSyncPayload emits the same entity contract sent to the API", () => {
  const payload = createSyncPayload({
    lots: [{ id: 2, name: "Local lot" }, null],
    currentLotId: "2",
    sales: [],
    loadSalesForLotId: () => [],
    wheelConfigs: [{ id: 91, name: "Wheel" }, null],
    activeWheelConfigId: "91",
    workspaceId: " team-42 "
  } as never, 5);

  assert.deepEqual(payload, {
    lots: [{ id: 2, name: "Local lot" }],
    salesByLot: {},
    wheelConfigs: [{ id: 91, name: "Wheel" }],
    activeWheelConfigId: 91,
    clientVersion: 5,
    activeLotId: 2,
    workspaceId: "team-42"
  });
});

test("sync wheel config DTOs preserve game fields and drop unknown config data", () => {
  assert.deepEqual(toSyncWheelConfigDtos([
    {
      id: "91",
      name: " Grid Night ",
      spinPrice: "12.5",
      targetMargin: "45",
      gameType: "grid",
      outcomeCount: "75",
      gridCellCount: "88",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      debugOnly: "drop-me",
      tiers: [
        {
          id: "tier-1",
          label: " Chase ",
          color: "#ffcc00",
          chancePercent: "25.5",
          slots: "26",
          costPerTier: "8.25",
          packsCount: "2",
          deductionType: "singles",
          sets: ["A", 99],
          boundLotId: "10",
          boundLotIds: ["10", "12", "bad", "12"],
          boundSinglesId: "501",
          isChase: true,
          celebrationEmoji: "star",
          extraTierField: "drop"
        }
      ]
    },
    { id: 92, name: "Bad tiers", tiers: "bad" },
    { name: "Missing id", tiers: [] }
  ]), [
    {
      id: 91,
      name: "Grid Night",
      spinPrice: 12.5,
      targetMargin: 45,
      gameType: "grid",
      outcomeCount: 75,
      gridCellCount: 88,
      tiers: [
        {
          id: "tier-1",
          label: "Chase",
          color: "#ffcc00",
          chancePercent: 25.5,
          slots: 26,
          costPerTier: 8.25,
          packsCount: 2,
          deductionType: "singles",
          sets: ["A"],
          boundLotId: 10,
          boundLotIds: [10, 12],
          boundSinglesId: 501,
          isChase: true,
          celebrationEmoji: "star"
        }
      ],
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z"
    }
  ]);
});

test("sync wheel config DTOs preserve bracket battle templates", () => {
  assert.deepEqual(toSyncWheelConfigDtos([
    {
      id: "93",
      name: " Bracket Night ",
      gameType: "bracket",
      bracketBattle: {
        participantCount: 8,
        participants: ["A", "B", "C", "D", "E", "F", "G", "H", "drop"],
        prizes: Array.from({ length: 7 }, (_unused, index) => ({
          id: `p-${index + 1}`,
          sourceType: index === 0 ? "lot" : "manual",
          sourceKey: index === 0 ? "lot:10" : "",
          label: `Prize ${index + 1}`,
          lotId: index === 0 ? "10" : null,
          singlesPurchaseEntryId: null,
          quantity: "1",
          cost: "2.5",
          value: "5"
        }))
      },
      tiers: [{ id: "should-drop-for-bracket" }]
    }
  ]), [
    {
      id: 93,
      name: "Bracket Night",
      gameType: "bracket",
      bracketBattle: {
        participantCount: 8,
        participants: ["A", "B", "C", "D", "E", "F", "G", "H"],
        prizes: Array.from({ length: 7 }, (_unused, index) => ({
          id: `p-${index + 1}`,
          sourceType: index === 0 ? "lot" : "manual",
          sourceKey: index === 0 ? "lot:10" : "",
          label: `Prize ${index + 1}`,
          lotId: index === 0 ? 10 : null,
          singlesPurchaseEntryId: null,
          quantity: 1,
          cost: 2.5,
          value: 5
        }))
      },
      tiers: []
    }
  ]);
});

test("sync sales DTOs preserve concurrency and wheel/singles fields while dropping unknown data", () => {
  assert.deepEqual(toSyncSalesByLotDto({
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
      },
      { id: "bad", price: 1 }
    ],
    "bad-lot": [{ id: 1 }],
    "11": "not-array"
  }), {
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

test("sync live pricing DTOs normalize prices and concurrency metadata", () => {
  assert.deepEqual(normalizeSyncLivePricingDto({
    livePackPrice: "4.5",
    liveBoxPriceSell: "120",
    liveSpotPrice: "8",
    version: "3",
    updatedAt: "2026-04-03T10:00:00.000Z",
    updatedBy: "user-2",
    mutationId: "live:1",
    extra: "drop"
  }), {
    livePackPrice: 4.5,
    liveBoxPriceSell: 120,
    liveSpotPrice: 8,
    version: 3,
    updatedAt: "2026-04-03T10:00:00.000Z",
    updatedBy: "user-2",
    mutationId: "live:1"
  });

  assert.equal(normalizeSyncLivePricingDto(null), null);
  assert.equal(normalizeSyncLivePricingDto({
    livePackPrice: -1,
    liveBoxPriceSell: 2,
    liveSpotPrice: 3
  }), null);
});
