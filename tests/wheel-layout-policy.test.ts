import assert from "node:assert/strict";
import { test } from "vitest";
import {
  WHEEL_COMPACT_LAYOUT_BREAKPOINT,
  isWheelCompactViewport,
  resolveWheelCanvasTargetSize,
  resolveWheelLayoutMode
} from "../src/components/windows/wheelLayoutPolicy.ts";

test("wheel compact breakpoint is inclusive at the configured threshold", () => {
  assert.equal(WHEEL_COMPACT_LAYOUT_BREAKPOINT, 1100);
  assert.equal(isWheelCompactViewport(1100), true);
  assert.equal(resolveWheelLayoutMode(1100), "compact");
});

test("wheel compact breakpoint flips to expanded above the threshold", () => {
  assert.equal(isWheelCompactViewport(1101), false);
  assert.equal(resolveWheelLayoutMode(1101), "expanded");
});

test("compact wheel canvas sizing caps mobile and tablet widths before height", () => {
  const size = resolveWheelCanvasTargetSize({
    panelWidth: 500,
    viewportWidth: 1100,
    viewportHeight: 900,
    presentationMode: false
  });

  assert.equal(size, 420);
});

test("compact presentation canvas sizing is capped separately and respects height", () => {
  const size = resolveWheelCanvasTargetSize({
    panelWidth: 700,
    viewportWidth: 900,
    viewportHeight: 580,
    presentationMode: true
  });

  assert.equal(size, 260);
});

test("expanded wheel canvas sizing falls back to its larger desktop caps", () => {
  const size = resolveWheelCanvasTargetSize({
    panelWidth: 700,
    viewportWidth: 1400,
    viewportHeight: 900,
    presentationMode: false
  });

  assert.equal(size, 520);
});

test("wheel canvas sizing falls back to max size when panel width is unavailable", () => {
  const compactSize = resolveWheelCanvasTargetSize({
    panelWidth: null,
    viewportWidth: 1100,
    viewportHeight: 900,
    presentationMode: false
  });

  const expandedSize = resolveWheelCanvasTargetSize({
    panelWidth: undefined,
    viewportWidth: 1400,
    viewportHeight: 900,
    presentationMode: true
  });

  assert.equal(compactSize, 420);
  assert.equal(expandedSize, 720);
});
