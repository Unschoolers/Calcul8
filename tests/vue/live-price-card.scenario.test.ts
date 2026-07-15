import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import LivePriceCard from "../../src/components/live-price/LivePriceCard.vue";
import { renderWithApp } from "./render.ts";

function renderLivePriceCard(overrides: Record<string, unknown> = {}) {
  const onUpdate = vi.fn();
  const view = renderWithApp(LivePriceCard, {
    props: {
      modelValue: 10,
      label: "Pack price",
      icon: "mdi-cards",
      units: 4,
      calculateProfit: (units: number, price: number) => units * price - 20,
      safeFixed: (value: number, decimals = 2) => value.toFixed(decimals),
      "onUpdate:modelValue": onUpdate,
      ...overrides
    }
  });
  return { onUpdate, view };
}

describe("live price card scenarios", () => {
  test("increases the live price from its accessible control", async () => {
    const { onUpdate } = renderLivePriceCard();

    await fireEvent.click(screen.getByRole("button", { name: "Increase price Pack price" }));

    expect(onUpdate).toHaveBeenCalledWith(11);
  });

  test("decreases the live price from its accessible control", async () => {
    const { onUpdate } = renderLivePriceCard();
    await fireEvent.click(screen.getByRole("button", { name: "Decrease price Pack price" }));
    expect(onUpdate).toHaveBeenCalledWith(9);
  });

  test("selects a visible price scenario", async () => {
    const { onUpdate } = renderLivePriceCard();

    await fireEvent.click(screen.getByRole("button", { name: /^\+\$1\$11\.00/ }));

    expect(onUpdate).toHaveBeenCalledWith(11);
  });

  test("shows a back-to-target recommendation when the remaining price is short", () => {
    renderLivePriceCard({ avgPriceNeeded: 14, remainingUnits: 2 });

    expect(screen.getByText("Back to target")).toBeVisible();
  });

  test("explains when no target price is available", () => {
    renderLivePriceCard({ avgPriceNeeded: null });
    expect(screen.getByText("Set a profit target to see the average price you still need from here.")).toBeVisible();
  });

  test("shows an on-target status when the current price matches the target", () => {
    renderLivePriceCard({ avgPriceNeeded: 10, remainingUnits: 2 });
    expect(screen.getByText("On target")).toBeVisible();
  });

  test("does not offer a negative-price scenario from zero", () => {
    renderLivePriceCard({ modelValue: 0 });
    expect(screen.queryByRole("button", { name: /^-\$/ })).toBeNull();
  });
});
