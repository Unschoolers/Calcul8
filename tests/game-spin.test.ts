import assert from "node:assert/strict";
import { test } from "vitest";
import {
  calculateWheelSpinEndAngle,
  chooseWheelPreviewTargetIndex,
  createWheelSpinPlan,
  easeOutQuart,
  resolveWheelLiveDurationMs,
  resolveWheelLiveExtraRotations,
  resolveWheelPreviewDurationMs,
  resolveWheelPreviewExtraRotations
} from "../src/app-core/shared/game-spin.ts";

test("createWheelSpinPlan returns deterministic angles and spectator metadata", () => {
  const plan = createWheelSpinPlan({
    slotCount: 4,
    targetIndex: 1,
    currentAngle: 0,
    extraRotations: Math.PI * 10,
    durationMs: 4500.4,
    startedAt: 1234,
    spinIdSeed: "spin"
  });

  assert.ok(plan);
  assert.equal(plan.sliceAngle, Math.PI / 2);
  assert.equal(plan.targetIndex, 1);
  assert.equal(plan.startAngle, 0);
  assert.equal(
    plan.endAngle,
    calculateWheelSpinEndAngle({
      currentAngle: 0,
      targetIndex: 1,
      sliceAngle: Math.PI / 2,
      extraRotations: Math.PI * 10
    })
  );
  assert.equal(plan.durationMs, 4500.4);
  assert.deepEqual(plan.spectatorAnimation, {
    spinId: `spin-1-${Math.round(plan.endAngle * 1000)}`,
    startedAt: 1234,
    durationMs: 4500,
    startAngle: 0,
    endAngle: plan.endAngle,
    targetIndex: 1
  });
});

test("createWheelSpinPlan rejects invalid targets and slot counts", () => {
  assert.equal(createWheelSpinPlan({
    slotCount: 0,
    targetIndex: 0,
    currentAngle: 0,
    extraRotations: 0,
    durationMs: 0,
    startedAt: 0
  }), null);
  assert.equal(createWheelSpinPlan({
    slotCount: 2,
    targetIndex: 2,
    currentAngle: 0,
    extraRotations: 0,
    durationMs: 0,
    startedAt: 0
  }), null);
});

test("wheel preview spin helpers keep random values bounded", () => {
  assert.equal(chooseWheelPreviewTargetIndex(10, 0), 0);
  assert.equal(chooseWheelPreviewTargetIndex(10, 0.999), 9);
  assert.equal(chooseWheelPreviewTargetIndex(0, 0.5), -1);
  assert.equal(resolveWheelPreviewExtraRotations(0), Math.PI * 6);
  assert.equal(resolveWheelPreviewExtraRotations(0.999), Math.PI * 10);
  assert.equal(resolveWheelLiveExtraRotations(0), Math.PI * 10);
  assert.equal(resolveWheelLiveExtraRotations(0.999), Math.PI * 16);
  assert.equal(resolveWheelPreviewDurationMs(0), 2200);
  assert.equal(resolveWheelPreviewDurationMs(1), 3100);
  assert.equal(resolveWheelLiveDurationMs(0), 4000);
  assert.equal(resolveWheelLiveDurationMs(1), 5500);
});

test("easeOutQuart stays compatible with existing wheel easing", () => {
  assert.equal(easeOutQuart(0), 0);
  assert.equal(easeOutQuart(1), 1);
  assert.ok(easeOutQuart(0.5) > 0.5);
});
