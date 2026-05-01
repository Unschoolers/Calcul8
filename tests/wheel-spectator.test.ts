import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  buildWheelSpectatorSessionUrl,
  buildWheelSpectatorSnapshot,
  normalizeWheelPublicSessionId
} from "../src/components/windows/wheel/services/wheelSpectator.ts";
import { buildSlotsFromConfig } from "../src/components/windows/wheel/services/wheelHelpers.ts";
import { createWheelWindowState } from "../src/components/windows/wheel/coordinator/wheelControllerState.ts";
import type { WheelConfig } from "../src/types/app.ts";
import { makeLot } from "./helpers/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("wheel spectator session ids are normalized for generated links", () => {
  vi.stubGlobal("window", {
    location: {
      href: "https://app.whatfees.ca/spectator.html?session=AbC123"
    }
  });

  assert.equal(normalizeWheelPublicSessionId(" AbC123 "), "abc123");
  assert.equal(
    buildWheelSpectatorSessionUrl(" AbC123 "),
    "https://app.whatfees.ca/spectator.html?session=abc123"
  );
});

test("buildWheelSpectatorSnapshot returns a viewer-safe summary with chase heat and proof", () => {
  const config: WheelConfig = {
    id: 1,
    name: "Saturday Wheel",
    spinPrice: 12,
    targetMargin: 20,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [
      {
        id: "regular",
        label: "Regular Hit",
        color: "#2563eb",
        slots: 6,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 201
      },
      {
        id: "chase-live",
        label: "Alt Art Chase",
        color: "#f59e0b",
        slots: 2,
        costPerTier: 22,
        packsCount: 1,
        deductionType: "singles",
        sets: [],
        boundLotId: 301,
        boundSinglesId: 901,
        isChase: true
      }
    ]
  };

  const vm = createWheelWindowState() as Record<string, unknown>;
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelController.activeSlots = activeSlots;
  vm.wheelSpinCounts = new Array(activeSlots.length).fill(0);
  const regularIndex = activeSlots.findIndex((slot) => slot.tier === "regular");
  const chaseIndex = activeSlots.findIndex((slot) => slot.tier === "chase-live");
  vm.wheelSpinCounts[regularIndex] = 1;
  vm.wheelSpinCounts[chaseIndex] = 1;
  vm.wheelTotalSpins = 2;
  vm.wheelLastResult = "🎉 Alt Art Chase";
  vm.wheelLastResultColor = "#f59e0b";
  vm.wheelFairnessHistory = [{
    spinNumber: 2,
    label: "Alt Art Chase",
    color: "#f59e0b",
    hash: "hash-2",
    seed: "seed-2",
    clientSeed: "client-2",
    verificationUrl: "https://api.example.test/wheel/fairness/verify?spin=2",
    algorithm: "whatfees-wheel-v1",
    timestamp: 2_000
  }];
  vm.wheelChaseTallyHistory = [{
    tierId: "legacy",
    label: "Legacy Chase",
    color: "#dc2626",
    count: 1
  }];
  vm.lots = [
    makeLot({
      id: 201,
      name: "Regular Lot"
    }),
    makeLot({
      id: 301,
      name: "Singles Lot",
      lotType: "singles",
      singlesPurchases: [{
        id: 901,
        item: "Alt Art Chase",
        cost: 22,
        quantity: 2,
        marketValue: 45
      }]
    })
  ];
  vm.currentLotId = 301;
  vm.sales = [];
  vm.singlesSoldCountByPurchaseId = {};

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.snapshotVersion, 1);
  assert.equal(snapshot.wheelName, "Saturday Wheel");
  assert.equal(snapshot.sessionStatus, "live");
  assert.equal(snapshot.totalSpins, 2);
  assert.equal(snapshot.lastResultLabel, "Alt Art Chase");
  assert.equal(snapshot.wheelSlots.length, activeSlots.length);
  assert.equal(snapshot.wheelSlots[chaseIndex]?.tier, "chase-live");
  assert.equal(snapshot.recentFairnessHistory.length, 1);
  assert.equal(snapshot.recentFairnessHistory[0]?.verificationUrl, "https://api.example.test/wheel/fairness/verify?spin=2");
  assert.equal(snapshot.featuredChaseLabel, "Alt Art Chase");
  assert.equal(snapshot.featuredChaseHeat, "very_low");
  assert.deepEqual(
    snapshot.chaseBoard.map((entry) => ({
      label: entry.label,
      status: entry.status,
      hits: entry.hitCount
    })),
    [
      { label: "Alt Art Chase", status: "live", hits: 1 },
      { label: "Legacy Chase", status: "claimed", hits: 1 }
    ]
  );
  assert.equal("wheelSessionNetRevenue" in snapshot, false);
  assert.equal("wheelPendingInventoryIssues" in snapshot, false);
});

test("buildWheelSpectatorSnapshot carries active spin animation metadata", () => {
  const config: WheelConfig = {
    id: 5,
    name: "Animated Wheel",
    spinPrice: 10,
    targetMargin: 20,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [{
      id: "tier-1",
      label: "Prize",
      color: "#2563eb",
      slots: 1,
      costPerTier: 4,
      packsCount: 1,
      deductionType: "none",
      sets: []
    }]
  };

  const vm = createWheelWindowState() as Record<string, unknown>;
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelSpinning = true;
  vm.wheelController.activeSlots = buildSlotsFromConfig(config);
  vm.wheelSpinCounts = [1];
  vm.wheelTotalSpins = 1;
  vm._wheelSpectatorSpinAnimation = {
    spinId: "spin-1",
    startedAt: 10_000,
    durationMs: 4_500,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 0
  };

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.isSpinning, true);
  assert.deepEqual(snapshot.spinAnimation, {
    spinId: "spin-1",
    startedAt: 10_000,
    durationMs: 4_500,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 0
  });
});

test("buildWheelSpectatorSnapshot includes mystery grid cells for spectator mode", () => {
  const config: WheelConfig = {
    id: 6,
    name: "Grid Night",
    spinPrice: 10,
    targetMargin: 20,
    gameType: "grid",
    outcomeCount: 25,
    gridCellCount: 25,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [
      {
        id: "floor",
        label: "Floor",
        color: "#2563eb",
        chancePercent: 80,
        slots: 80,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: []
      },
      {
        id: "hit",
        label: "Hit",
        color: "#f59e0b",
        chancePercent: 20,
        slots: 20,
        costPerTier: 20,
        packsCount: 1,
        deductionType: "none",
        sets: []
      }
    ]
  };

  const vm = createWheelWindowState() as Record<string, unknown>;
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelController.activeSlots = activeSlots;
  vm.wheelSpinCounts = new Array(activeSlots.length).fill(0);
  vm.wheelTotalSpins = 1;
  vm.wheelGridReveals = [{
    cellIndex: 4,
    slotIndex: 4,
    label: "Floor",
    color: "#2563eb",
    tier: "floor",
    spinNumber: 1,
    timestamp: 1_000
  }];
  vm.wheelGridRevealAnimating = true;
  vm.wheelGridHighlightCellIndex = 7;

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.isSpinning, true);
  assert.equal(snapshot.gridCells?.length, 25);
  assert.equal(snapshot.gridCells?.[4]?.revealed, true);
  assert.equal(snapshot.gridCells?.[4]?.label, "Floor");
  assert.equal(snapshot.gridCells?.[7]?.revealed, false);
  assert.equal(snapshot.gridHighlightCellIndex, 7);
});

test("buildWheelSpectatorSnapshot prefers the displayed grid config over a stale active config", () => {
  const activeConfig: WheelConfig = {
    id: 7,
    name: "Grid",
    spinPrice: 10,
    targetMargin: 20,
    gameType: "wheel",
    outcomeCount: 36,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: []
  };
  const displayedGridConfig: WheelConfig = {
    ...activeConfig,
    gameType: "grid",
    gridCellCount: 36,
    tiers: [
      {
        id: "hit",
        label: "Hit",
        color: "#f59e0b",
        chancePercent: 100,
        slots: 100,
        costPerTier: 20,
        packsCount: 1,
        deductionType: "none",
        sets: []
      }
    ]
  };
  const vm = createWheelWindowState() as Record<string, unknown>;
  const activeSlots = buildSlotsFromConfig(displayedGridConfig);
  vm.activeWheelConfig = activeConfig;
  vm.wheelDisplayConfig = displayedGridConfig;
  vm.wheelMode = "live";
  vm.wheelController.activeSlots = activeSlots;
  vm.wheelSpinCounts = new Array(activeSlots.length).fill(0);

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.gridCells?.length, 36);
});

test("buildWheelSpectatorSnapshot keeps preview grid reveals in spectator mode", () => {
  const config: WheelConfig = {
    id: 8,
    name: "Preview Grid",
    spinPrice: 10,
    targetMargin: 20,
    gameType: "grid",
    outcomeCount: 25,
    gridCellCount: 25,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [{
      id: "floor",
      label: "Floor",
      color: "#2563eb",
      chancePercent: 100,
      slots: 100,
      costPerTier: 4,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }]
  };
  const vm = createWheelWindowState() as Record<string, unknown>;
  const previewSlots = buildSlotsFromConfig(config);
  vm.editingWheelConfig = config;
  vm.activeWheelConfig = config;
  vm.wheelMode = "config";
  vm.wheelController.previewSlots = previewSlots;
  vm.wheelController.previewSpinCounts = new Array(previewSlots.length).fill(0);
  vm.wheelPreviewTotalSpins = 1;
  vm.wheelPreviewGridReveals = [{
    cellIndex: 3,
    slotIndex: 3,
    label: "Floor",
    color: "#2563eb",
    tier: "floor",
    spinNumber: 1,
    timestamp: 1_000
  }];

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.gridCells?.[3]?.revealed, true);
  assert.equal(snapshot.gridCells?.[3]?.label, "Floor");
});

test("buildWheelSpectatorSnapshot falls back to the lowest-profit live tier when no chase is active", () => {
  const config: WheelConfig = {
    id: 2,
    name: "No Chase Wheel",
    spinPrice: 12,
    targetMargin: 25,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [
      {
        id: "safe",
        label: "Safe Pull",
        color: "#2563eb",
        slots: 4,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 401
      },
      {
        id: "sweat",
        label: "Sweat Pull",
        color: "#dc2626",
        slots: 2,
        costPerTier: 13,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 402
      }
    ]
  };

  const vm = createWheelWindowState() as Record<string, unknown>;
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelController.activeSlots = activeSlots;
  vm.wheelSpinCounts = new Array(activeSlots.length).fill(0);
  vm.wheelTotalSpins = 0;
  vm.wheelFairnessHistory = [];
  vm.wheelChaseTallyHistory = [];
  vm.lots = [
    makeLot({
      id: 401,
      name: "Safe Lot"
    }),
    makeLot({
      id: 402,
      name: "Sweat Lot"
    })
  ];

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.featuredChaseLabel, "Sweat Pull");
  assert.equal(snapshot.featuredChaseHeat, "very_low");
  assert.equal(snapshot.wheelSlots.length, activeSlots.length);
  assert.equal(snapshot.chaseBoard.length, 0);
});

test("buildWheelSpectatorSnapshot ramps fallback heat when the sweat tier is under-hitting its slot share", () => {
  const config: WheelConfig = {
    id: 3,
    name: "Pressure Wheel",
    spinPrice: 12,
    targetMargin: 20,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [
      {
        id: "filler",
        label: "Filler",
        color: "#2563eb",
        slots: 16,
        costPerTier: 6.62,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 501
      },
      {
        id: "sweat",
        label: "2 packs",
        color: "#f59e0b",
        slots: 3,
        costPerTier: 14,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 502
      }
    ]
  };

  const vm = createWheelWindowState() as Record<string, unknown>;
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelController.activeSlots = activeSlots;
  vm.wheelSpinCounts = activeSlots.map((slot) => slot.tier === "filler" ? 1 : 0);
  vm.wheelTotalSpins = 16;
  vm.wheelFairnessHistory = [];
  vm.wheelChaseTallyHistory = [];
  vm.lots = [
    makeLot({
      id: 501,
      name: "Filler Lot"
    }),
    makeLot({
      id: 502,
      name: "Sweat Lot"
    })
  ];

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.featuredChaseLabel, "2 packs");
  assert.equal(snapshot.featuredChaseHeat, "very_high");
});

test("buildWheelSpectatorSnapshot cools fallback heat after the sweat tier just landed", () => {
  const config: WheelConfig = {
    id: 4,
    name: "Cooldown Wheel",
    spinPrice: 12,
    targetMargin: 20,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [
      {
        id: "filler",
        label: "Tier 3",
        color: "#2563eb",
        slots: 16,
        costPerTier: 6.62,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 601
      },
      {
        id: "sweat",
        label: "2 packs",
        color: "#f59e0b",
        slots: 3,
        costPerTier: 14,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        boundLotId: 602
      }
    ]
  };

  const vm = createWheelWindowState() as Record<string, unknown>;
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelController.activeSlots = activeSlots;
  vm.wheelSpinCounts = activeSlots.map((slot) => slot.tier === "filler" ? 1 : 0);
  const sweatIndex = activeSlots.findIndex((slot) => slot.tier === "sweat");
  vm.wheelSpinCounts[sweatIndex] = 1;
  vm.wheelTotalSpins = 17;
  vm.wheelFairnessHistory = [{
    spinNumber: 17,
    label: "2 packs",
    color: "#f59e0b",
    hash: "hash-17",
    seed: "seed-17",
    verificationUrl: "https://api.example.test/wheel/fairness/verify?spin=17",
    timestamp: 17_000
  }];
  vm.wheelChaseTallyHistory = [];
  vm.lots = [
    makeLot({
      id: 601,
      name: "Tier 3 Lot"
    }),
    makeLot({
      id: 602,
      name: "2 Packs Lot"
    })
  ];

  const snapshot = buildWheelSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.featuredChaseLabel, "2 packs");
  assert.equal(snapshot.featuredChaseHeat, "very_low");
});
