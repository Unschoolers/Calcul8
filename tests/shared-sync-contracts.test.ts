import assert from "node:assert/strict";
import { test } from "vitest";
import {
  normalizeSyncMetadataDto,
  normalizeSyncSaleDto,
  normalizeSyncGameSessionDto,
  normalizeSyncWheelConfigDto,
  toSyncLotDtos
} from "../shared/sync-contracts.mjs";

test("shared sync contracts normalize sale DTOs for frontend and API boundaries", () => {
  assert.deepEqual(normalizeSyncSaleDto({
    id: "501",
    type: "wheel",
    quantity: "1",
    price: "14.25",
    customer: " Alex ",
    linkedWheelId: "91",
    unknown: "drop"
  }), {
    id: 501,
    type: "wheel",
    quantity: 1,
    price: 14.25,
    customer: "Alex",
    linkedWheelId: 91
  });
});

test("shared sync contracts normalize game config DTOs for frontend and API boundaries", () => {
  assert.deepEqual(normalizeSyncWheelConfigDto({
    id: "91",
    name: " Grid ",
    gameType: "grid",
    outcomeCount: "80",
    tiers: [
      {
        id: "tier-1",
        label: " Chase ",
        chancePercent: "25",
        unknown: "drop"
      }
    ],
    unknown: "drop"
  }), {
    id: 91,
    name: "Grid",
    gameType: "grid",
    outcomeCount: 80,
    tiers: [
      {
        id: "tier-1",
        label: "Chase",
        chancePercent: 25
      }
    ]
  });
});

test("shared sync contracts normalize multi-lot tier sources", () => {
  assert.deepEqual(normalizeSyncWheelConfigDto({
    id: "91",
    tiers: [
      {
        id: "multi",
        boundLotId: "10",
        boundLotIds: ["10", "11", "bad", -1, "11"],
        boundSinglesId: "501"
      },
      {
        id: "legacy",
        boundLotId: "12",
        boundLotIds: "bad"
      }
    ]
  }), {
    id: 91,
    tiers: [
      {
        id: "multi",
        boundLotId: 10,
        boundLotIds: [10, 11],
        boundSinglesId: 501
      },
      {
        id: "legacy",
        boundLotId: 12,
        boundLotIds: [12]
      }
    ]
  });
});

test("shared sync contracts normalize lot DTOs with singles purchase rows", () => {
  assert.deepEqual(toSyncLotDtos([{
    id: "12",
    name: " Singles ",
    lotType: "singles",
    singlesPurchases: [
      {
        id: "801",
        item: " Pikachu ",
        cardNumber: " 25 ",
        cost: "4.5",
        currency: "USD",
        quantity: "2",
        marketValue: "7",
        marketValueCurrency: "CAD",
        unknown: "drop"
      },
      { id: "bad", item: "Broken", quantity: 1 }
    ],
    unknown: "drop"
  }]), [{
    id: 12,
    name: "Singles",
    lotType: "singles",
    singlesPurchases: [{
      id: 801,
      item: "Pikachu",
      cardNumber: "25",
      cost: 4.5,
      currency: "USD",
      quantity: 2,
      marketValue: 7,
      marketValueCurrency: "CAD"
    }]
  }]);
});

test("shared sync contracts normalize sync metadata DTOs", () => {
  assert.deepEqual(normalizeSyncMetadataDto({
    version: "7",
    updatedAt: "2026-05-01T12:00:00.000Z",
    activeWheelConfigId: "91",
    salesMode: "entity",
    livePricingMode: "entity",
    unknown: "drop"
  }), {
    version: 7,
    updatedAt: "2026-05-01T12:00:00.000Z",
    activeWheelConfigId: 91,
    salesMode: "entity",
    livePricingMode: "entity"
  });
});

test("shared sync contracts normalize game session DTOs", () => {
  assert.deepEqual(normalizeSyncGameSessionDto({
    activeWheelConfigId: "91",
    wheelConfigs: [{ id: "91", name: " Grid ", debugOnly: "drop" }],
    wheelTotalSpins: "2",
    wheelSpinCounts: ["1", -1, "bad"],
    wheelSessionNetRevenue: "12.5",
    wheelSessionCostAdjustment: "3",
    wheelFairnessHistory: [{
      spinNumber: "2",
      label: " Prize ",
      color: " #fff ",
      hash: " hash ",
      seed: " seed ",
      clientSeed: " client ",
      verificationUrl: " https://example.test ",
      algorithm: " algo ",
      timestamp: "123",
      unknown: "drop"
    }],
    wheelChaseTallyHistory: [{
      tierId: " tier-1 ",
      label: " Chase ",
      color: " #f00 ",
      count: "2",
      unknown: "drop"
    }],
    wheelCurrentAngle: "1.25",
    wheelLastResult: " Prize ",
    wheelLastResultColor: " #f00 ",
    wheelSessionUpdatedAt: "456",
    unknown: "drop"
  }, 999), {
    activeWheelConfigId: 91,
    wheelConfigs: [{ id: 91, name: "Grid" }],
    wheelTotalSpins: 2,
    wheelSpinCounts: [1, 0, 0],
    wheelSessionNetRevenue: 12.5,
    wheelSessionCostAdjustment: 3,
    wheelFairnessHistory: [{
      spinNumber: 2,
      label: "Prize",
      color: "#fff",
      hash: "hash",
      seed: "seed",
      clientSeed: "client",
      verificationUrl: "https://example.test",
      algorithm: "algo",
      timestamp: 123
    }],
    wheelChaseTallyHistory: [{
      tierId: "tier-1",
      label: "Chase",
      color: "#f00",
      count: 2
    }],
    wheelCurrentAngle: 1.25,
    wheelLastResult: "Prize",
    wheelLastResultColor: "#f00",
    wheelSessionUpdatedAt: 456,
    wheelPendingInventoryIssues: [],
    wheelSkippedDeductions: []
  });
});

test("shared sync contracts preserve required multi-lot pending selections", () => {
  assert.deepEqual(normalizeSyncGameSessionDto({
    wheelPendingInventoryIssues: [{
      slotName: "3 packs",
      slotColor: "#f00",
      slotCost: "12.5",
      slotTier: "tier-1",
      slotPacksCount: "3",
      slotDeductionType: "packs",
      slotIndex: "2",
      selectedLotId: "",
      spinNumber: "4",
      candidateLotIds: ["10", "11", "bad", "10"],
      requiresLotSelection: true,
      unknown: "drop"
    }]
  }, 999).wheelPendingInventoryIssues, [{
    slotName: "3 packs",
    slotColor: "#f00",
    slotCost: 12.5,
    slotTier: "tier-1",
    slotPacksCount: 3,
    slotDeductionType: "packs",
    slotIndex: 2,
    selectedLotId: null,
    spinNumber: 4,
    slotSinglesId: null,
    candidateLotIds: [10, 11],
    requiresLotSelection: true
  }]);
});
