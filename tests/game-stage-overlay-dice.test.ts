import assert from "node:assert/strict";
import * as THREE from "three";
import { test } from "vitest";
import {
  getDieDisplayRotation,
  getOverlayDieScaleForScreenSlot,
  getOverlayDieBoxFaceValues,
  getDieTopFaceRotation,
  getOverlayDieVisualSpec,
  getDicePipLayout,
  sampleDiceRollMotion
} from "../src/components/windows/game/overlay/gameStageOverlayDice.ts";

test("dice pip layouts use standard d6 counts", () => {
  assert.equal(getDicePipLayout(1).length, 1);
  assert.equal(getDicePipLayout(2).length, 2);
  assert.equal(getDicePipLayout(3).length, 3);
  assert.equal(getDicePipLayout(4).length, 4);
  assert.equal(getDicePipLayout(5).length, 5);
  assert.equal(getDicePipLayout(6).length, 6);
});

test("dice roll motion follows a bounded gravity arc", () => {
  const start = sampleDiceRollMotion(0);
  const mid = sampleDiceRollMotion(0.5);
  const end = sampleDiceRollMotion(1);

  assert.equal(start.height, 0);
  assert.equal(end.height, 0);
  assert.ok(mid.height > start.height);
  assert.ok(mid.rotation.x > start.rotation.x);
  assert.ok(mid.rotation.y > start.rotation.y);
  assert.ok(mid.rotation.z > start.rotation.z);
});

test("overlay die visual spec keeps dice compact and pips inset", () => {
  const spec = getOverlayDieVisualSpec();

  assert.ok(spec.dieSize <= 0.66);
  assert.ok(spec.pipInsetDepth > 0);
  assert.ok(spec.pipRadius < spec.dieSize / 6);
});

test("overlay die box face order matches a standard d6", () => {
  assert.deepEqual(getOverlayDieBoxFaceValues(), [2, 5, 3, 4, 1, 6]);
});

test("top-face rotations bring the requested die value to the top face", () => {
  const faceNormals = new Map<number, THREE.Vector3>([
    [2, new THREE.Vector3(1, 0, 0)],
    [5, new THREE.Vector3(-1, 0, 0)],
    [3, new THREE.Vector3(0, 1, 0)],
    [4, new THREE.Vector3(0, -1, 0)],
    [1, new THREE.Vector3(0, 0, 1)],
    [6, new THREE.Vector3(0, 0, -1)]
  ]);

  for (const value of [1, 2, 3, 4, 5, 6]) {
    const normal = faceNormals.get(value)!.clone();
    const rotation = getDieTopFaceRotation(value);
    normal.applyEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));

    assert.ok(Math.abs(normal.x) < 0.0001, `value ${value} should not tilt on x`);
    assert.ok(Math.abs(normal.z) < 0.0001, `value ${value} should not tilt on z`);
    assert.ok(Math.abs(normal.y - 1) < 0.0001, `value ${value} should face upward`);
  }
});

test("display rotations bring the requested die value toward the viewer", () => {
  const faceNormals = new Map<number, THREE.Vector3>([
    [2, new THREE.Vector3(1, 0, 0)],
    [5, new THREE.Vector3(-1, 0, 0)],
    [3, new THREE.Vector3(0, 1, 0)],
    [4, new THREE.Vector3(0, -1, 0)],
    [1, new THREE.Vector3(0, 0, 1)],
    [6, new THREE.Vector3(0, 0, -1)]
  ]);

  for (const value of [1, 2, 3, 4, 5, 6]) {
    const normal = faceNormals.get(value)!.clone();
    const rotation = getDieDisplayRotation(value);
    normal.applyEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));

    assert.ok(normal.z > 0.92, `value ${value} should face the viewer`);
    assert.ok(normal.z > Math.abs(normal.x), `value ${value} should prefer the front over side tilt`);
  }
});

test("screen-slot die scaling compensates for taller overlay viewports", () => {
  const spec = getOverlayDieVisualSpec();

  const compactScale = getOverlayDieScaleForScreenSlot({
    slotSizePx: 104,
    viewportHeightPx: 420,
    cameraDistance: 9.5,
    cameraFovDegrees: 28,
    dieSize: spec.dieSize
  });
  const tallScale = getOverlayDieScaleForScreenSlot({
    slotSizePx: 104,
    viewportHeightPx: 840,
    cameraDistance: 9.5,
    cameraFovDegrees: 28,
    dieSize: spec.dieSize
  });

  assert.ok(compactScale > tallScale);
  assert.ok(compactScale > 0);
  assert.ok(tallScale > 0);
});
