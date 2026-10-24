import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import LivePriceCard from "../../src/components/live-price/LivePriceCard.vue";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
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

    const disclosure = screen.getByText("Compare prices").closest("details")!;
    expect(disclosure.open).toBe(false);
    disclosure.open = true;
    await fireEvent.click(screen.getByRole("button", { name: /^\$11\.00/ }));

    expect(onUpdate).toHaveBeenCalledWith(11);
  });

  test("shows a back-to-target recommendation when the remaining price is short", () => {
    renderLivePriceCard({ avgPriceNeeded: 14, remainingUnits: 2 });

    expect(screen.getByText("Target")).toBeVisible();
  });

  test("applies the recommended target price from the adjustment link", async () => {
    const { onUpdate } = renderLivePriceCard({ avgPriceNeeded: 14, remainingUnits: 2 });

    await fireEvent.click(screen.getByRole("button", { name: "Adjust from current $14.00" }));

    expect(onUpdate).toHaveBeenCalledWith(14);
  });

  test("explains when no target price is available", () => {
    renderLivePriceCard({ avgPriceNeeded: null });
    expect(screen.getByText("Set a profit target to see the average price you still need from here.")).toBeVisible();
  });

  test("labels the applied suggested price without implying positive profit after selling costs", () => {
    renderLivePriceCard({
      avgPriceNeeded: 10,
      remainingUnits: 2,
      calculateProfit: () => -3,
      forecastProfit: -3
    });

    expect(screen.getByText("Suggested price applied")).toBeVisible();
    expect(screen.getByText("Projected net profit after selling costs")).toBeVisible();
    expect(document.querySelector(".live-pricing-card__projection strong")).toHaveClass("text-error");
    expect(screen.queryByText("On target")).toBeNull();
  });

  test("uses a neutral French status when no units remain even though the needed price differs", () => {
    renderLivePriceCard({
      modelValue: 10,
      avgPriceNeeded: 14,
      remainingUnits: 0,
      calculateProfit: () => 0,
      translateText: (key: string) => translateAppMessage("fr-CA", key)
    });

    expect(screen.getByText("Aucun ajustement proposé")).toBeVisible();
    expect(screen.getByText("$10.00")).toBeVisible();
    expect(screen.queryByText("Vous êtes sur la cible. Rien à ajuster ici.")).toBeNull();
  });

  test("keeps the same French status when the current price equals the needed price and stock remains", () => {
    renderLivePriceCard({
      modelValue: 10,
      avgPriceNeeded: 10,
      remainingUnits: 2,
      calculateProfit: () => 0,
      translateText: (key: string) => translateAppMessage("fr-CA", key)
    });

    expect(screen.getByText("Aucun ajustement proposé")).toBeVisible();
    expect(screen.getByText("$10.00")).toBeVisible();
  });

  test("does not offer a negative-price scenario from zero", () => {
    renderLivePriceCard({ modelValue: 0 });
    expect(screen.queryByRole("button", { name: /^-\$/ })).toBeNull();
  });
});
