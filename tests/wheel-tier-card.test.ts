import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { WheelTierCard } from "../src/components/windows/wheel/WheelTierCard.ts";

test("finishTierEditor closes the editor and auto-applies when the wheel can apply", () => {
  const vm = {
    editorOpen: true,
    canApplyWheelConfig: true,
    applyWheelConfig: vi.fn()
  };

  WheelTierCard.methods.finishTierEditor.call(vm as never);

  assert.equal(vm.editorOpen, false);
  assert.equal(vm.applyWheelConfig.mock.calls.length, 1);
});

test("finishTierEditor closes the editor without auto-applying when the wheel cannot apply", () => {
  const vm = {
    editorOpen: true,
    canApplyWheelConfig: false,
    applyWheelConfig: vi.fn()
  };

  WheelTierCard.methods.finishTierEditor.call(vm as never);

  assert.equal(vm.editorOpen, false);
  assert.equal(vm.applyWheelConfig.mock.calls.length, 0);
});

test("deleteTierAndClose removes the tier and then auto-applies", () => {
  const vm = {
    editorOpen: true,
    tierIndex: 3,
    canApplyWheelConfig: true,
    removeTier: vi.fn(),
    applyWheelConfig: vi.fn(),
    finishTierEditor: WheelTierCard.methods.finishTierEditor
  };

  WheelTierCard.methods.deleteTierAndClose.call(vm as never);

  assert.deepEqual(vm.removeTier.mock.calls[0], [3]);
  assert.equal(vm.editorOpen, false);
  assert.equal(vm.applyWheelConfig.mock.calls.length, 1);
});