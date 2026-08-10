import assert from "node:assert/strict";
import { test } from "vitest";
import { uiShellNavigationMethods } from "../src/app-core/methods/ui/common/shell-navigation.ts";

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
