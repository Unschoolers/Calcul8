import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  buildGameSpectatorSessionUrl,
  buildGameSpectatorSnapshot,
  normalizeGamePublicSessionId
} from "../src/components/windows/game/services/gameSpectator.ts";
import { buildSlotsFromConfig } from "../src/components/windows/game/services/wheelSlots.ts";
import { createGameWindowState, ensureWheelControllerState } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import type { WheelConfig } from "../src/types/app.ts";
import { makeLot } from "./helpers/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("game spectator session ids are normalized for generated links", () => {
  vi.stubGlobal("window", {
    location: {
      href: "https://app.whatfees.ca/spectator.html?session=AbC123"
    }
  });

  assert.equal(normalizeGamePublicSessionId(" AbC123 "), "abc123");
  assert.equal(
    buildGameSpectatorSessionUrl(" AbC123 "),
    "https://app.whatfees.ca/spectator.html?session=abc123"
  );
});

test("buildGameSpectatorSnapshot returns a viewer-safe wheel summary with chase heat and proof", () => {
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

  const vm = createGameWindowState() as Record<string, any>;
  ensureWheelControllerState(vm);
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.activeWheelSlots = activeSlots;
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

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.snapshotVersion, 2);
  assert.equal(snapshot.gameName, "Saturday Wheel");
  assert.equal(snapshot.sessionStatus, "live");
  assert.equal(snapshot.sessionResultCount, 2);
  assert.equal(snapshot.lastResultLabel, "Alt Art Chase");
  assert.equal(snapshot.outcomeSlots.length, activeSlots.length);
  assert.equal(snapshot.outcomeSlots[chaseIndex]?.tier, "chase-live");
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

test("buildGameSpectatorSnapshot carries active spin animation metadata", () => {
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

  const vm = createGameWindowState() as Record<string, any>;
  ensureWheelControllerState(vm);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.wheelSpinning = true;
  vm.activeWheelSlots = buildSlotsFromConfig(config);
  vm.wheelSpinCounts = [1];
  vm.wheelTotalSpins = 1;
  vm._gameSpectatorSpinAnimation = {
    spinId: "spin-1",
    startedAt: 10_000,
    durationMs: 4_500,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 0
  };

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.isSpinning, true);
  assert.deepEqual(snapshot.resultAnimation, {
    spinId: "spin-1",
    startedAt: 10_000,
    durationMs: 4_500,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 0
  });
});

test("buildGameSpectatorSnapshot falls back to the lowest-profit live tier when no chase is active", () => {
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

  const vm = createGameWindowState() as Record<string, any>;
  ensureWheelControllerState(vm);
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.activeWheelSlots = activeSlots;
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

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.featuredChaseLabel, "Sweat Pull");
  assert.equal(snapshot.featuredChaseHeat, "very_low");
  assert.equal(snapshot.outcomeSlots.length, activeSlots.length);
  assert.equal(snapshot.chaseBoard.length, 0);
});

test("buildGameSpectatorSnapshot ramps fallback heat when the sweat tier is under-hitting its slot share", () => {
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

  const vm = createGameWindowState() as Record<string, any>;
  ensureWheelControllerState(vm);
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.activeWheelSlots = activeSlots;
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

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.featuredChaseLabel, "2 packs");
  assert.equal(snapshot.featuredChaseHeat, "very_high");
});

test("buildGameSpectatorSnapshot cools fallback heat after the sweat tier just landed", () => {
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

  const vm = createGameWindowState() as Record<string, any>;
  ensureWheelControllerState(vm);
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.activeWheelSlots = activeSlots;
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

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.featuredChaseLabel, "2 packs");
  assert.equal(snapshot.featuredChaseHeat, "very_low");
});




