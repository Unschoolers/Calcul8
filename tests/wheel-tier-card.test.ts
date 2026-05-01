import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { WheelTierCard } from "../src/components/windows/wheel/WheelTierCard.ts";

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
    editorDraft: null,
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

test("tier card chance input rebalances the current editing config", () => {
  const tiers = [
    { id: "t1", label: "A", color: "#fff", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50 },
    { id: "t2", label: "B", color: "#000", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50 }
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
  const tiers = [
    { id: "t1", label: "A", color: "#fff", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50 },
    { id: "t2", label: "B", color: "#000", slots: 50, packsCount: 1, costPerTier: 1, chancePercent: 50 }
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
