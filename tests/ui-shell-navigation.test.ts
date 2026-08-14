import assert from "node:assert/strict";
import { test } from "vitest";
import {
    isDominantHorizontalTabSwipe,
    isTabSwipeIgnoredTarget,
    resolveTabSwipeTarget,
    uiShellNavigationMethods
} from "../src/app-core/methods/ui/common/shell-navigation.ts";

function createContext(options: { currentTab: "config" | "live"; hasLotSelected: boolean }) {
  return {
    ...options,
    notice: null as [string, string] | null,
    notify(message: string, color = "info") {
      this.notice = [message, color];
    },
    t(key: string) {
      return key === "shellSelectLotFirstNotice" ? "Select inventory first." : key;
    }
  };
}

test("selectPrimaryTab explains lot-required destinations without navigating", () => {
  const context = createContext({ currentTab: "config", hasLotSelected: false });

  uiShellNavigationMethods.selectPrimaryTab.call(context, "sales");

  assert.equal(context.currentTab, "config");
  assert.deepEqual(context.notice, ["Select inventory first.", "warning"]);
});

test("selectPrimaryTab navigates when the destination is available", () => {
  const context = createContext({ currentTab: "config", hasLotSelected: true });

  uiShellNavigationMethods.selectPrimaryTab.call(context, "live");

  assert.equal(context.currentTab, "live");
  assert.equal(context.notice, null);
});

test("selectPrimaryTab keeps setup available before inventory exists", () => {
  const context = createContext({ currentTab: "live", hasLotSelected: false });

  uiShellNavigationMethods.selectPrimaryTab.call(context, "config");

  assert.equal(context.currentTab, "config");
  assert.equal(context.notice, null);
});

test("resolveTabSwipeTarget moves one tab for a dominant horizontal swipe", () => {
  assert.equal(resolveTabSwipeTarget("config", 300, 100, 220, 108), "live");
  assert.equal(resolveTabSwipeTarget("live", 220, 100, 300, 108), "config");
});

test("resolveTabSwipeTarget ignores short and mostly vertical gestures", () => {
  assert.equal(resolveTabSwipeTarget("config", 300, 100, 260, 108), null);
  assert.equal(resolveTabSwipeTarget("config", 300, 100, 220, 190), null);
});

test("resolveTabSwipeTarget does not move beyond the tab order", () => {
  assert.equal(resolveTabSwipeTarget("config", 100, 100, 180, 100), null);
  assert.equal(resolveTabSwipeTarget("portfolio", 180, 100, 100, 100), null);
});

test("tab swipes can start on buttons, including grid cells", () => {
  const button = {
    closest: () => null
  };
  assert.equal(isTabSwipeIgnoredTarget(button as never), false);
});

test("tab swipes can start on native text-entry controls", () => {
  const input = {
    closest: () => null
  };
  assert.equal(isTabSwipeIgnoredTarget(input as never), false);
});

test("tab swipes can start on Vuetify input surfaces", () => {
  const field = {
    closest: () => null
  };
  assert.equal(isTabSwipeIgnoredTarget(field as never), false);
});

test("tab swipes support explicit opt-out surfaces", () => {
  const ignoredSurface = {
    closest: (selectors: string) => selectors.includes("[data-swipe-ignore]")
  };
  assert.equal(isTabSwipeIgnoredTarget(ignoredSurface as never), true);
});

test("tab swipe dominance is based on horizontal movement", () => {
  assert.equal(isDominantHorizontalTabSwipe(300, 100, 220, 108), true);
  assert.equal(isDominantHorizontalTabSwipe(300, 100, 220, 190), false);
});
