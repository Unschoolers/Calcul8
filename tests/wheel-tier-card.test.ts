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
