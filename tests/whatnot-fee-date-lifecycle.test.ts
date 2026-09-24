import { afterEach, expect, test, vi } from "vitest";
import { clearWhatnotFeeDateRefresh, refreshWhatnotFeeDate, scheduleWhatnotFeeDateRefresh } from "../src/app-core/lifecycle.ts";

afterEach(() => vi.useRealTimers());

test("refreshes the Whatnot local calendar date when the app resumes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 30));
  const state = { whatnotFeeDateOnly: "2026-10-18" };

  vi.setSystemTime(new Date(2026, 9, 19, 0, 0, 1));
  refreshWhatnotFeeDate(state);

  expect(state.whatnotFeeDateOnly).toBe("2026-10-19");
});

test("midnight timer refreshes the date and can be cleared during teardown", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 30));
  const originalWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout }
  });
  const state = { whatnotFeeDateOnly: "2026-10-18", whatnotFeeDateTimeoutId: null as number | null };

  try {
    scheduleWhatnotFeeDateRefresh(state);
    expect(state.whatnotFeeDateTimeoutId).not.toBeNull();
    vi.advanceTimersByTime(30_600);
    expect(state.whatnotFeeDateOnly).toBe("2026-10-19");
    expect(state.whatnotFeeDateTimeoutId).not.toBeNull();
    clearWhatnotFeeDateRefresh(state);
    expect(state.whatnotFeeDateTimeoutId).toBeNull();
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
