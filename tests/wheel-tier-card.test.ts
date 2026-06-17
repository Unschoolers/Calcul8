import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, vi } from "vitest";
import { WheelInspector } from "../src/components/windows/game/inspector/WheelInspector.ts";
import { WheelTierCard } from "../src/components/windows/game/inspector/WheelTierCard.ts";
import type { WheelTier } from "../src/types/app.ts";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WHEEL_TIER_CARD_TEMPLATE = path.resolve(
  TESTS_DIR,
  "../src/components/windows/game/inspector/WheelTierCard.html"
);
const WHEEL_INSPECTOR_TEMPLATE = path.resolve(
  TESTS_DIR,
  "../src/components/windows/game/inspector/WheelInspector.html"
);
const WHEEL_WINDOW_TEMPLATE = path.resolve(
  TESTS_DIR,
  "../src/components/windows/game/coordinator/GameWindow.html"
);
const WHEEL_TIER_EDITOR_STYLES = path.resolve(
  TESTS_DIR,
  "../src/components/windows/game/styles/wheel-tier-editor.css"
);

test("finishTierEditor closes the editor and auto-applies when the wheel can apply", () => {
  const tier = { id: 1, label: "Original", color: "#fff", packsCount: 1, costPerTier: 1, chancePercent: 50 };
  const vm = {
    editorOpen: true,
    editorDraft: { ...tier, label: "Draft" },
    tier,
    canApplyWheelConfig: true,
    applyWheelConfig: vi.fn()
  };

  WheelTierCard.methods.finishTierEditor.call(vm as never);

  assert.equal(vm.editorOpen, false);
  assert.equal(vm.editorDraft, null);
  assert.equal(vm.tier.label, "Draft");
  assert.equal(vm.applyWheelConfig.mock.calls.length, 1);
});

test("finishTierEditor closes the editor without auto-applying when the wheel cannot apply", () => {
  const tier = { id: 1, label: "Original", color: "#fff", packsCount: 1, costPerTier: 1, chancePercent: 50 };
  const vm = {
    editorOpen: true,
    editorDraft: { ...tier, label: "Draft" },
    tier,
    canApplyWheelConfig: false,
    applyWheelConfig: vi.fn()
  };

  WheelTierCard.methods.finishTierEditor.call(vm as never);

  assert.equal(vm.editorOpen, false);
  assert.equal(vm.editorDraft, null);
  assert.equal(vm.tier.label, "Draft");
  assert.equal(vm.applyWheelConfig.mock.calls.length, 0);
});

test("tier editor drafts changes until Done", () => {
  const tier = { id: 1, label: "Original", color: "#fff", packsCount: 1, costPerTier: 1, chancePercent: 50 };
  const vm = {
    editorOpen: false,
    editorDraft: null as typeof tier | null,
    tier,
    canApplyWheelConfig: true,
    applyWheelConfig: vi.fn()
  };

  WheelTierCard.methods.openTierEditor.call(vm as never);
  vm.editorDraft!.label = "Draft";

  assert.equal(vm.tier.label, "Original");
  assert.equal(vm.editorOpen, true);

  WheelTierCard.methods.cancelTierEditor.call(vm as never);

  assert.equal(vm.editorOpen, false);
  assert.equal(vm.editorDraft, null);
  assert.equal(vm.tier.label, "Original");
  assert.equal(vm.applyWheelConfig.mock.calls.length, 0);
});

test("units deducted field recalculates on input instead of waiting for change", () => {
  const template = fs.readFileSync(WHEEL_TIER_CARD_TEMPLATE, "utf8");

  assert.match(template, /@input="onTierPacksChange\(editorTier\)"/);
  assert.doesNotMatch(template, /@change="onTierPacksChange\(editorTier\)"/);
});

test("tier source selectors use dialog-safe overlay menu props", () => {
  const template = fs.readFileSync(WHEEL_TIER_CARD_TEMPLATE, "utf8");
  const styles = fs.readFileSync(WHEEL_TIER_EDITOR_STYLES, "utf8");

  assert.match(template, /contentClass: 'wheel-tier-source-menu'/);
  assert.match(template, /contentClass: 'wheel-tier-singles-menu'/);
  assert.match(styles, /\.wheel-tier-source-menu,[\s\S]*\.wheel-tier-singles-menu\s*\{[\s\S]*z-index: 4200 !important;/);
});

test("tier source bulk lot multi-select uses Vuetify default item rendering", () => {
  const template = fs.readFileSync(WHEEL_TIER_CARD_TEMPLATE, "utf8");
  const sourceSelectStart = template.indexOf(":items=\"bulkTierSourceItems\"");
  const singlesSelectStart = template.indexOf(":items=\"getSinglesItemsForTier(editorTier)\"");
  const sourceSelectBlock = template.slice(sourceSelectStart, singlesSelectStart);

  assert.ok(sourceSelectStart > 0);
  assert.ok(singlesSelectStart > sourceSelectStart);
  assert.doesNotMatch(sourceSelectBlock, /<template #item=/);
});

test("tier source editor uses a bulk lot multi-select without a source mode toggle", () => {
  const template = fs.readFileSync(WHEEL_TIER_CARD_TEMPLATE, "utf8");

  assert.doesNotMatch(template, /wheelTierSourceModeSingle/);
  assert.doesNotMatch(template, /wheelTierSourceModeMulti/);
  assert.match(template, /:items="bulkTierSourceItems"/);
  assert.match(template, /multiple/);
  assert.match(template, /boundLotIds/);
});

test("wheel inspector settings do not expose target margin input", () => {
  const template = fs.readFileSync(WHEEL_INSPECTOR_TEMPLATE, "utf8");

  assert.doesNotMatch(template, /wheelInspectorTargetMarginLabel/);
  assert.doesNotMatch(template, /editingWheelConfig\.targetMargin/);
});

test("required pending lot selections use a persistent modal instead of the inline batch card", () => {
  const template = fs.readFileSync(WHEEL_WINDOW_TEMPLATE, "utf8");

  assert.match(template, /<v-dialog[\s\S]*v-if="wheelHasRequiredLotSelection && wheelPendingInventoryIssues\.length"[\s\S]*persistent/);
  assert.match(template, /content-class="wheel-pending-lot-dialog app-mobile-fullscreen-dialog"/);
  assert.match(template, /v-if="wheelEndingSession && !wheelHasRequiredLotSelection && wheelPendingInventoryIssues\.length"/);
  assert.match(template, /:disabled="wheelPendingInventoryIssues\.some\(\(entry\) => !entry\.selectedLotId\)"/);
});

test("required pending lot selections suppress duplicate stage warnings", () => {
  const template = fs.readFileSync(WHEEL_WINDOW_TEMPLATE, "utf8");

  assert.match(template, /v-if="wheelSpinBlockedReason && !wheelHasRequiredLotSelection"/);
  assert.match(template, /v-if="wheelDisplayInventoryWarning && !wheelHasRequiredLotSelection"/);
});

test("tier list uses the celebration emoji as the tier badge when selected", () => {
  const template = fs.readFileSync(WHEEL_TIER_CARD_TEMPLATE, "utf8");

  assert.match(template, /v-if="tier\.celebrationEmoji"/);
  assert.match(template, /class="wheel-tier-emoji-badge"/);
  assert.match(template, /\{\{ tier\.celebrationEmoji \}\}/);
  assert.match(template, /v-else class="wheel-tier-dot"/);
});

test("tier card summary shows actual wheel sections instead of repeating chance", () => {
  const tier = {
    id: "t1",
    label: "Original",
    color: "#fff",
    slots: 20,
    packsCount: 3,
    costPerTier: 25.5,
    chancePercent: 20,
    deductionType: "packs",
    sets: []
  };
  const vm = {
    tier,
    editingWheelConfig: {
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 40,
      gameType: "wheel",
      outcomeCount: 25,
      createdAt: "",
      tiers: [
        tier,
        {
          id: "t2",
          label: "Other",
          color: "#000",
          slots: 80,
          packsCount: 1,
          costPerTier: 1,
          chancePercent: 80,
          deductionType: "packs",
          sets: []
        }
      ]
    }
  };

  const items = WheelTierCard.computed!.tierSummaryItems.call(vm as never);

  assert.deepEqual(items, ["5 sections", "3 hits", "$25.50"]);
});

test("tier card summary shows actual mystery grid tiles", () => {
  const tier = {
    id: "hit",
    label: "Hit",
    color: "#fff",
    slots: 10,
    packsCount: 1,
    costPerTier: 12,
    chancePercent: 10,
    deductionType: "packs",
    sets: []
  };
  const vm = {
    tier,
    editingWheelConfig: {
      id: 1,
      name: "Grid",
      spinPrice: 10,
      targetMargin: 40,
      gameType: "grid",
      outcomeCount: 100,
      gridCellCount: 100,
      createdAt: "",
      tiers: [
        {
          id: "floor",
          label: "Floor",
          color: "#000",
          slots: 90,
          packsCount: 1,
          costPerTier: 1,
          chancePercent: 90,
          deductionType: "packs",
          sets: []
        },
        tier
      ]
    }
  };

  const items = WheelTierCard.computed!.tierSummaryItems.call(vm as never);

  assert.deepEqual(items, ["10 tiles", "1 hit", "$12.00"]);
});

test("multi-lot tier status keeps Bulk as the type without using Multi-lot as a chip", () => {
  const tier = {
    id: "multi",
    label: "Tier 4",
    color: "#fff",
    slots: 1,
    packsCount: 1,
    costPerTier: 5.25,
    deductionType: "packs",
    boundLotId: 10,
    boundLotIds: [10, 20],
    sets: []
  };
  const vm = {
    tier,
    tierTypeLabel: WheelTierCard.computed!.tierTypeLabel.call({
      tier,
      isBoundLotSingles: () => false
    } as never),
    tierInventoryMeta: null
  };

  const chips = WheelTierCard.computed!.tierStatusChips.call(vm as never);

  assert.equal(chips[0]?.label, "Bulk");
  assert.equal(chips.some((chip) => chip.label === "Multi-lot"), false);
});

test("multi-lot tiers are grouped under Multi-lot with source lot names for the info menu", () => {
  const groups = WheelInspector.computed!.wheelBuilderTierGroups.call({
    preferredLanguage: "en",
    editingWheelConfig: {
      tiers: [{
        id: "multi",
        label: "Tier 4",
        color: "#fff",
        slots: 1,
        packsCount: 1,
        costPerTier: 5.25,
        deductionType: "packs",
        boundLotId: 10,
        boundLotIds: [10, 20],
        sets: []
      }]
    },
    lots: [
      { id: 10, name: "Jujutsu Kaisen vol2", lotType: "bulk", boxesPurchased: 1, packsPerBox: 36 },
      { id: 20, name: "Bleach vol3", lotType: "bulk", boxesPurchased: 1, packsPerBox: 28 }
    ],
    loadSalesForLotId: () => []
  } as never);

  assert.equal(groups[0]?.title, "Multi-lot");
  assert.deepEqual(groups[0]?.sourceLotNames, ["Jujutsu Kaisen vol2", "Bleach vol3"]);
});

test("tier card chance input rebalances the current editing config", () => {
  const tiers: WheelTier[] = [
    { id: "t1", label: "A", color: "#fff", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50, deductionType: "packs", sets: [] },
    { id: "t2", label: "B", color: "#000", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50, deductionType: "packs", sets: [] }
  ];
  const vm = {
    editingWheelConfig: { tiers },
    setTierChance(tier: (typeof tiers)[number], value: unknown) {
      WheelTierCard.methods.setTierChance.call(this as never, tier, value);
    }
  };

  WheelTierCard.methods.setTierChance.call(vm as never, tiers[0], 70);

  assert.equal(tiers[0]!.chancePercent, 70);
  assert.equal(tiers[0]!.slots, 70);
  assert.equal(tiers[1]!.chancePercent, 30);
  assert.equal(tiers[1]!.slots, 30);
});

test("tier card chance bar updates odds from pointer position", () => {
  const tiers: WheelTier[] = [
    { id: "t1", label: "A", color: "#fff", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50, deductionType: "packs", sets: [] },
    { id: "t2", label: "B", color: "#000", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50, deductionType: "packs", sets: [] }
  ];
  const vm = {
    editingWheelConfig: { tiers },
    setTierChance(tier: (typeof tiers)[number], value: unknown) {
      WheelTierCard.methods.setTierChance.call(this as never, tier, value);
    }
  };
  const event = {
    currentTarget: {
      setPointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 10, width: 200 })
    },
    pointerId: 1,
    clientX: 60
  };

  WheelTierCard.methods.setTierChanceFromPointerEvent.call(vm as never, tiers[0], event as unknown as PointerEvent);

  assert.equal(tiers[0]!.chancePercent, 25);
  assert.equal(tiers[1]!.chancePercent, 75);
});

test("deleteTierAndClose removes the tier and then auto-applies", () => {
  const vm = {
    editorOpen: true,
    editorDraft: { id: 4, label: "Draft", color: "#fff", packsCount: 1, costPerTier: 1, chancePercent: 50 },
    tierIndex: 3,
    canApplyWheelConfig: true,
    removeTier: vi.fn(),
    applyWheelConfig: vi.fn()
  };

  WheelTierCard.methods.deleteTierAndClose.call(vm as never);

  assert.deepEqual(vm.removeTier.mock.calls[0], [3]);
  assert.equal(vm.editorOpen, false);
  assert.equal(vm.editorDraft, null);
  assert.equal(vm.applyWheelConfig.mock.calls.length, 1);
});


