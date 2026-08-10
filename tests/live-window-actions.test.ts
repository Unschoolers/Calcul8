import assert from "node:assert/strict";
import { test } from "vitest";
import { liveWindowDefinition } from "../src/components/windows/live/LiveWindow.definition.ts";

test("Live clear action keeps destructive confirmation before clearing selections", () => {
  let confirmedAction: (() => void) | null = null;
  let cleared = false;
  const context = {
    askConfirmation(payload: { title: string; text: string; color?: string }, action: () => void) {
      assert.deepEqual(payload, {
        title: "Clear live item list?",
        text: "Remove every item from the live pricing list?",
        color: "error"
      });
      confirmedAction = action;
    },
    clearLiveSinglesSelection() {
      cleared = true;
    },
    t(key: string) {
      return ({
        shellClearLiveSinglesConfirmBody: "Remove every item from the live pricing list?",
        shellClearLiveSinglesConfirmTitle: "Clear live item list?"
      } as Record<string, string>)[key] ?? key;
    }
  };

  liveWindowDefinition.methods.confirmClearLiveSingles.call(context);

  assert.equal(cleared, false);
  assert.ok(confirmedAction);
  (confirmedAction as () => void)();
  assert.equal(cleared, true);
});
