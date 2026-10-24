import { fireEvent, screen } from "@testing-library/vue";
import { nextTick, reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { forecastComputed } from "../../src/app-core/computed/forecast.ts";
import { configPricingMethods } from "../../src/app-core/methods/config-pricing.ts";
import { createConfigWindowPorts, configWindowPortsKey } from "../../src/components/windows/config/configWindowPorts.ts";
import ConfigWindow from "../../src/components/windows/config/ConfigWindow.vue";
import { renderWithApp } from "./render.ts";

function setupConfig(options: { language?: "en" | "fr-CA"; purchaseUiMode?: "simple" | "expert"; costInputMode?: "total" | "perBox"; currency?: "CAD" | "USD"; purchaseShippingCost?: number } = {}) {
  const language = options.language ?? "fr-CA";
  const state = reactive({
    ...createInitialState(),
    preferredLanguage: language,
    purchaseUiMode: options.purchaseUiMode ?? "simple",
    costInputMode: options.costInputMode ?? "total",
    currentLotId: 1,
    hasLotSelected: true,
    currentLotType: "bulk",
    boxesPurchased: 2,
    packsPerBox: 3,
    boxPriceCost: 50,
    totalPacks: 6,
    purchaseShippingCost: options.purchaseShippingCost ?? 20,
    purchaseDate: "2026-10-01",
    purchaseTaxPercent: 0,
    includeTax: false,
    currency: options.currency ?? "CAD",
    sellingCurrency: "CAD" as "CAD" | "USD",
    exchangeRate: 1.4,
    whatnotVertical: null,
    feeProfilePreset: "none",
    whatnotFeeSummary: null,
    lots: [{ id: 1, name: "Test lot", lotType: "bulk", boxesPurchased: 2, packsPerBox: 3, whatnotVertical: "tcg", feeProfilePreset: "whatnot" }],
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key as never, params),
    formatCurrency: (value: number | null | undefined) => Number(value ?? 0).toFixed(2),
    formatDate: (value: string) => value,
    onPurchaseConfigChange: vi.fn(),
    updatePurchaseCostInput: vi.fn(),
    requestPurchaseUiMode: vi.fn(),
    saveLotsToStorage: vi.fn()
  });
  Object.defineProperties(state, {
    boxPriceCostCAD: {
      configurable: true,
      get: () => forecastComputed.boxPriceCostCAD.call(state as never)
    },
    conversionInfo: {
      configurable: true,
      get: () => forecastComputed.conversionInfo.call(state as never)
    },
    purchaseCostInputLabel: {
      configurable: true,
      get: () => forecastComputed.purchaseCostInputLabel.call(state as never)
    },
    purchaseCostInputValue: {
      configurable: true,
      get: () => forecastComputed.purchaseCostInputValue.get.call(state as never),
      set: (value: number | string) => forecastComputed.purchaseCostInputValue.set.call(state as never, value)
    },
    purchaseShippingCostCAD: {
      configurable: true,
      get: () => forecastComputed.purchaseShippingCostCAD.call(state as never)
    },
    totalCaseCost: {
      configurable: true,
      get: () => forecastComputed.totalCaseCost.call(state as never)
    }
  });
  state.updatePurchaseCostInput = vi.fn((value: number | string | null) =>
    configPricingMethods.updatePurchaseCostInput.call(state as never, value)
  );
  const view = renderWithApp(ConfigWindow, {
    global: {
      provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
      stubs: { AdminSyncImportCard: true }
    }
  });
  return { state, view };
}

test("French bulk configuration copy is visible and preserves the cost metrics", async () => {
  const { state, view } = setupConfig();
  const summary = view.container.querySelector(".config-summary-hero")!;

  expect(screen.getByText("Coût total du lot")).toBeVisible();
  expect(screen.getByText("Ce coût total sert au calcul des profits, des prix et du portefeuille.")).toBeVisible();
  expect(screen.getByText("Avant taxes, droits de douane et frais de livraison.")).toBeVisible();
  expect(screen.getByLabelText("Coût des boîtes")).toBeVisible();
  const metrics = [...summary.querySelectorAll<HTMLElement>(".config-summary-pill")];
  const exactText = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
  expect(exactText(summary.querySelector(".config-summary-hero__value"))).toBe("$120.00 CAD");
  expect(metrics.map((metric) => [
    exactText(metric.querySelector(".config-summary-pill__label")),
    exactText(metric.querySelector(".config-summary-pill__value")),
    exactText(metric.querySelector(".config-summary-pill__meta"))
  ])).toEqual([
    ["2 boîtes", "$60.00", "Par boîte"],
    ["6 items", "$20.00", "Par item"]
  ]);
  expect(summary.textContent).toContain("Date d’achat");

  state.totalPacks = 2;
  await nextTick();
  expect(exactText(metrics[0]?.querySelector(".config-summary-pill__label"))).toBe("2 boîtes");
  expect(exactText(metrics[1]?.querySelector(".config-summary-pill__label"))).toBe("2 items");
  state.boxesPurchased = 1;
  state.totalPacks = 1;
  await nextTick();
  expect(exactText(metrics[0]?.querySelector(".config-summary-pill__label"))).toBe("1 boîte");
  expect(exactText(metrics[1]?.querySelector(".config-summary-pill__label"))).toBe("1 item");
  state.boxesPurchased = 0;
  state.totalPacks = 0;
  await nextTick();
  expect(exactText(metrics[0]?.querySelector(".config-summary-pill__label"))).toBe("0 boîtes");
  expect(exactText(metrics[1]?.querySelector(".config-summary-pill__label"))).toBe("0 items");
});

test("expert purchase fields and Whatnot estimate retain translated context", async () => {
  const { state, view } = setupConfig({
    purchaseUiMode: "expert", costInputMode: "perBox", currency: "USD", purchaseShippingCost: 5
  });

  await vi.waitFor(() => expect(screen.getByLabelText("Coût par boîte")).toBeVisible());
  expect(screen.getByLabelText("Taux de conversion USD → CAD")).toBeVisible();
  expect(screen.getByLabelText("Frais de livraison à l’achat (USD)")).toBeVisible();
  expect(screen.getByLabelText("Taux de taxe à l’achat (%)")).toBeVisible();
  expect(screen.getByRole("button", { name: "Total des boîtes" })).toBeVisible();
  expect(screen.getByText("Avant taxes, droits de douane et frais de livraison.")).toBeVisible();
  const input = screen.getByLabelText("Coût par boîte");
  expect(input).toHaveValue(50);
  expect(view.container.textContent).toContain("Achat saisi en USD. Taux : 1 USD = 1.40 CAD. Sous-total converti : 147.00 CAD.");
  await fireEvent.update(input, "75.5");
  expect(state.updatePurchaseCostInput).toHaveBeenCalledWith("75.5");
  await nextTick();
  expect(state.boxPriceCost).toBe(75.5);
  expect(view.container.textContent).toContain("Sous-total converti : 218.40 CAD.");

  await fireEvent.click(screen.getByRole("button", { name: "Total des boîtes" }));
  await nextTick();
  const totalInput = screen.getByLabelText("Coût des boîtes");
  expect(state.costInputMode).toBe("total");
  expect(totalInput).toHaveValue(151);
  const computedState = state as typeof state & { purchaseCostInputValue: number; purchaseCostInputLabel: string };
  expect(computedState.purchaseCostInputValue).toBe(151);
  expect(computedState.purchaseCostInputLabel).toBe("Coût des boîtes");
});

test("English bulk configuration retains existing count and cost labels", () => {
  const { view } = setupConfig({ language: "en" });
  const summary = view.container.querySelector(".config-summary-hero")!;
  expect(summary.textContent).toContain("2 boxes");
  expect(summary.textContent).toContain("6 items");
  expect(screen.getByLabelText("Total Purchase")).toBeVisible();
  expect(screen.getByText("Before taxes, customs duties and shipping fees.")).toBeVisible();
});
