import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
    cancelTabPrewarm,
    scheduleTabPrewarm,
    TAB_PREWARM_GAP_MS,
    TAB_PREWARM_INITIAL_DELAY_MS
} from "../src/app-core/tab-prewarm.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("prewarms one inactive tab per idle gap", () => {
  vi.useFakeTimers();
  let idleCallback: (() => void) | null = null;
  vi.stubGlobal("window", {
    requestIdleCallback(callback: () => void) {
      idleCallback = callback;
      return 1;
    },
    cancelIdleCallback() {
      idleCallback = null;
    }
  });

  const context = {
    currentTab: "config" as const,
    currentLotId: 101,
    prewarmedTabs: [] as Array<"config" | "live" | "sales" | "portfolio" | "wheel">
  };

  scheduleTabPrewarm(context);
  vi.advanceTimersByTime(TAB_PREWARM_INITIAL_DELAY_MS);
  assert.deepEqual(context.prewarmedTabs, []);

  idleCallback?.();
  assert.deepEqual(context.prewarmedTabs, ["live"]);

  vi.advanceTimersByTime(TAB_PREWARM_GAP_MS);
  idleCallback?.();
  assert.deepEqual(context.prewarmedTabs, ["live", "sales"]);
});

test("cancelTabPrewarm stops future tab work", () => {
  vi.useFakeTimers();
  const context = {
    currentTab: "config" as const,
    currentLotId: 101,
    prewarmedTabs: [] as Array<"config" | "live" | "sales" | "portfolio" | "wheel">
  };

  scheduleTabPrewarm(context);
  cancelTabPrewarm(context);
  vi.advanceTimersByTime(TAB_PREWARM_INITIAL_DELAY_MS + TAB_PREWARM_GAP_MS);

  assert.deepEqual(context.prewarmedTabs, []);
});