import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import type { SyncGameSessionDto as CanonicalSyncGameSessionDto } from "../shared/sync-contracts";
import type { SyncGameSessionDto as EsmSyncGameSessionDto } from "../shared/sync-contracts.mjs";
import type { SyncGameSessionDto as CommonJsSyncGameSessionDto } from "../shared/sync-contracts.cjs";
import type { SyncGameSessionDto as ApiSyncGameSessionDto } from "../apps/api/src/shared/sync-contracts";
import {
  normalizeSyncMetadataDto,
  normalizeSyncSaleDto,
  normalizeSyncGameSessionDto,
  normalizeSyncWheelConfigDto,
  toSyncLotDtos
} from "../shared/sync-contracts.mjs";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;
type SyncContractParity = [
  Expect<Equal<CanonicalSyncGameSessionDto, EsmSyncGameSessionDto>>,
  Expect<Equal<CanonicalSyncGameSessionDto, CommonJsSyncGameSessionDto>>,
  Expect<Equal<CanonicalSyncGameSessionDto, ApiSyncGameSessionDto>>
];

void (0 as unknown as SyncContractParity);

test("sync declarations use one canonical contract body", async () => {
  const apiDeclarationUrl = new URL("../apps/api/src/shared/sync-contracts.d.ts", import.meta.url);
  const lines = (await readFile(apiDeclarationUrl, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  assert.equal(lines.length, 1, "the API sync declaration must be a thin re-export");
  assert.match(lines[0] ?? "", /^export \* from /u);
});

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
    wheelGridLayoutSeed: " session-seed ",
    wheelPreviewGridLayoutSeed: " preview-seed ",
    wheelGridReveals: [{
      cellIndex: "4",
      slotIndex: "7",
      label: " Floor ",
      color: " #123456 ",
      tier: " tier-1 ",
      spinNumber: "2",
      timestamp: "1234",
      unknown: "drop"
    }],
    wheelPreviewGridReveals: [{
      cellIndex: "5",
      slotIndex: "8",
      label: " Chase ",
      color: " #abcdef ",
      tier: " tier-2 ",
      spinNumber: "1",
      timestamp: "5678"
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
    wheelGridLayoutSeed: "session-seed",
    wheelPreviewGridLayoutSeed: "preview-seed",
    wheelGridReveals: [{
      cellIndex: 4,
      slotIndex: 7,
      label: "Floor",
      color: "#123456",
      tier: "tier-1",
      spinNumber: 2,
      timestamp: 1234
    }],
    wheelPreviewGridReveals: [{
      cellIndex: 5,
      slotIndex: 8,
      label: "Chase",
      color: "#abcdef",
      tier: "tier-2",
      spinNumber: 1,
      timestamp: 5678
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
