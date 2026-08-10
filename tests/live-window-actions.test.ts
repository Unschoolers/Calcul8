import assert from "node:assert/strict";
import { test } from "vitest";
import { liveWindowDefinition } from "../src/components/windows/live/LiveWindow.definition.ts";

const actionTranslations: Record<string, string> = {
  shellApplyLivePricesAction: "Save live prices",
  shellClearLiveSinglesAction: "Clear list",
  shellPriceCalculatorAction: "Calculator",
  shellResetLivePricesAction: "Reset prices",
  shellResetLiveSinglesPricesAction: "Reset item prices",
  shellUpgradePriceCalculatorAction: "Upgrade for calculator"
};

function translateAction(key: string): string {
  return actionTranslations[key] ?? key;
}

test("Live bulk pricing exposes Save as the direct action", () => {
  const context = {
    currentLotType: "bulk",
    hasLotSelected: true,
    hasProAccess: true,
    t: translateAction
  };
  const computed = liveWindowDefinition.computed as Record<string, (this: typeof context) => unknown>;

  assert.deepEqual(computed.liveContextPrimaryAction.call(context), {
    id: "save",
    icon: "mdi-content-save-outline",
    color: "primary",
    label: "Save live prices",
    disabled: false
  });
  assert.deepEqual(
    (computed.liveContextSecondaryActions.call(context) as Array<{ id: string }>).map((action) => action.id),
    ["calculator", "reset"]
  );
});

test("Live singles keeps Calculator direct and destructive Clear secondary", () => {
  const context = {
    currentLotType: "singles",
    effectiveLiveSinglesIds: [],
    hasLotSelected: true,
    hasProAccess: false,
    t: translateAction
  };
  const computed = liveWindowDefinition.computed as Record<string, (this: typeof context) => unknown>;

  assert.deepEqual(computed.liveContextPrimaryAction.call(context), {
    id: "calculator",
    icon: "mdi-calculator",
    color: "secondary",
    label: "Upgrade for calculator",
    disabled: false
  });
  assert.deepEqual(computed.liveContextSecondaryActions.call(context), [
    {
      id: "reset",
      icon: "mdi-restore",
      color: "surface",
      label: "Reset item prices",
      disabled: false
    },
    {
      id: "clear",
      icon: "mdi-broom",
      color: "error",
      label: "Clear list",
      disabled: true
    }
  ]);
});

test("Live dock routes each action through the existing feature methods", () => {
  const calls: string[] = [];
  const context = {
    accessProFeature(target: string) {
      calls.push(`access:${target}`);
    },
    applyLivePricesToDefaults() {
      calls.push("save");
    },
    confirmClearLiveSingles() {
      calls.push("clear");
    },
    resetLivePrices() {
      calls.push("reset");
    }
  };

  for (const actionId of ["save", "calculator", "reset", "clear"]) {
    liveWindowDefinition.methods.activateLiveContextAction.call(context, actionId);
  }

  assert.deepEqual(calls, ["save", "access:autoCalculate", "reset", "clear"]);
});

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
