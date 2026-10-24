import { fireEvent, screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { defineComponent, h, reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import type { WhatnotVertical } from "../../src/types/app.ts";
import type { WhatnotFeePeriodSummary } from "../../src/app-core/shared/whatnot-fee-summary.ts";
import { createConfigWindowPorts, configWindowPortsKey } from "../../src/components/windows/config/configWindowPorts.ts";
import ConfigWindow from "../../src/components/windows/config/ConfigWindow.vue";
import { createSinglesConfigPorts, singlesConfigPortsKey } from "../../src/components/windows/singles/singlesConfigPorts.ts";
import SinglesConfigWindow from "../../src/components/windows/singles/SinglesConfigWindow.vue";
import { renderWithApp } from "./render.ts";

const summary: WhatnotFeePeriodSummary = {
  currentTier: 2, previousPeriodGrossCad: 22_500, currentPeriodGrossCad: 4_000,
  nextThresholdCad: 10_000, isEstimate: true, missingLotIds: [2],
  periodStart: "2026-09-21", periodEndExclusive: "2026-10-19",
  previousPeriodStart: "2026-08-24", previousPeriodEndExclusive: "2026-09-21"
};
const t = (key: string, values?: Record<string, unknown>) => `${key} ${Object.values(values ?? {}).join(" ")}`;
const enConfig = JSON.parse(readFileSync("src/app-core/i18n/locales/en/config.json", "utf8")) as Record<string, string>;
const frConfig = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/config.json", "utf8")) as Record<string, string>;

function SelectStub() {
  return defineComponent({
    name: "VSelect",
    props: { label: String, modelValue: null, items: Array },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () => h("button", {
        type: "button", "aria-label": props.label,
        onClick: () => emit("update:modelValue", "fashion")
      }, String(props.label));
    }
  });
}

function createState(lotType: "bulk" | "singles", vertical: WhatnotVertical | null = "tcg") {
  const state = reactive({
    ...createInitialState(),
    currentLotId: 1 as number | null,
    hasLotSelected: true,
    totalCaseCost: 1288,
    totalPacks: 256,
    purchaseCostInputValue: 70,
    lots: [{ id: 1, name: "Test lot", lotType, singlesCatalogSource: "pokemon", whatnotVertical: vertical, feeProfilePreset: "whatnot" }],
    whatnotVertical: vertical,
    feeProfilePreset: "whatnot" as string,
    whatnotFeeSummary: summary,
    t,
    setCurrentLotWhatnotVertical(next: WhatnotVertical | null) {
      this.whatnotVertical = next;
      this.lots[0]!.whatnotVertical = next;
    },
    onPurchaseConfigChange: vi.fn(), updatePurchaseCostInput: vi.fn(), requestPurchaseUiMode: vi.fn(),
    saveLotsToStorage: vi.fn(), removeSinglesPurchaseRow: vi.fn(), onSinglesPurchaseRowsChange: vi.fn(),
    importSinglesPurchasesCsv: vi.fn(), confirmSinglesPurchasesCsvImport: vi.fn(), cancelSinglesPurchasesCsvImport: vi.fn(),
    formatCurrency: (value: number | null | undefined) => String(value ?? 0), formatDate: (value: string) => value,
    notify: vi.fn(), askConfirmation: vi.fn(),
    currentLotCatalogSource: "pokemon", singlesPurchases: [], singlesSoldCountByPurchaseId: {},
    sellingCurrency: "CAD", exchangeRate: 1, preferredLanguage: "en", currency: "CAD", conversionInfo: "",
    singlesPurchaseTotalCost: 0, singlesPurchaseTotalMarketValue: 0
  });
  return state;
}

test("bulk lot setup keeps live Whatnot fee status while category editing lives in the edit dialog", async () => {
  const state = createState("bulk", null);
  const view = renderWithApp(ConfigWindow, {
    global: {
      provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
      stubs: { VSelect: SelectStub(), AdminSyncImportCard: true }
    }
  });
  expect(screen.queryByText("configWhatnotVerticalLabel")).toBeNull();
  expect(screen.queryByText("configWhatnotVerticalLegacyHint")).toBeNull();
  expect(screen.queryByText("configWhatnotFeeStatusTitle")).toBeNull();
  state.whatnotVertical = "tcg";
  await vi.waitFor(() => expect(view.container.querySelector(".whatnot-fee-summary")).not.toBeNull());
  expect(view.container.querySelector(".whatnot-fee-summary")?.classList.contains("mt-3")).toBe(false);
  expect(view.container.textContent).toContain("configWhatnotFeeStatusTitle");
  expect(view.container.textContent).toContain("7.5%");
  expect(view.container.textContent).toContain("configWhatnotFeeStatusProgress");
  const details = view.container.querySelector("details");
  expect(details?.open).toBe(false);
  expect(details?.textContent).toContain("configWhatnotFeeStatusEstimate");
  await fireEvent.click(details!.querySelector("summary")!);
  expect(details?.open).toBe(true);
  expect(view.container.textContent).toContain("configWhatnotFeeStatusIncomplete");
});

test("bulk setup renders the qualified French Whatnot estimate from its existing fee fixture", async () => {
  const state = createState("bulk");
  state.t = (key: string, params?: Record<string, unknown>) =>
    translateAppMessage("fr-CA", key as never, params as never);
  renderWithApp(ConfigWindow, {
    global: {
      provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
      stubs: { VSelect: SelectStub(), AdminSyncImportCard: true }
    }
  });

  const details = document.querySelector(".whatnot-fee-summary__details")!;
  await fireEvent.click(details.querySelector("summary")!);
  expect(details.textContent).toContain(
    "Estimation fondée sur les ventes enregistrées dans WhatFees. Whatnot peut appliquer des ajustements ou inclure des ventes absentes de WhatFees."
  );
  expect(document.querySelector(".whatnot-fee-summary")?.textContent).not.toMatch(/\{\{.*?\}\}/);
});

test("bulk setup explains starter values with no inventory and hides the explanation for a selected lot", async () => {
  const state = createState("bulk");
  state.boxPriceCost = 70;
  state.boxesPurchased = 16;
  state.packsPerBox = 16;
  state.currentLotId = null;
  state.hasLotSelected = false;
  state.lots = [];
  state.t = ((key: string) => (state.preferredLanguage === "en" ? enConfig[key] : frConfig[key]) ?? key) as typeof state.t;
  const view = renderWithApp(ConfigWindow, {
    global: {
      provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
      stubs: { VSelect: SelectStub(), AdminSyncImportCard: true }
    }
  });

  expect(screen.getByText(enConfig.configNoInventoryExampleValues!)).toBeVisible();
  expect(view.container.querySelector(".config-summary-hero")?.textContent).toContain("$1288 CAD");
  expect(view.container.querySelector(".config-summary-hero")?.textContent).toContain("16 boxes");
  expect(view.container.querySelector(".config-summary-hero")?.textContent).toContain("256 items");
  expect(view.container.querySelector<HTMLInputElement>("#guided-onboarding-bulk-cost-input")?.value).toBe("70");
  expect(view.container.querySelector<HTMLInputElement>("#guided-onboarding-bulk-boxes-input")?.value).toBe("16");
  expect(view.container.querySelector<HTMLInputElement>("#guided-onboarding-bulk-packs-input")?.value).toBe("16");

  state.preferredLanguage = "fr";
  await vi.waitFor(() => expect(screen.getByText(frConfig.configNoInventoryExampleValues!)).toBeVisible());
  state.currentLotId = 1;
  state.hasLotSelected = true;
  state.lots = [{ id: 1, name: "Test lot", lotType: "bulk", singlesCatalogSource: "pokemon", whatnotVertical: "tcg", feeProfilePreset: "whatnot" }];
  await vi.waitFor(() => expect(screen.queryByText(frConfig.configNoInventoryExampleValues!)).toBeNull());
});

test("singles setup retains the live fee summary without exposing the category editor", async () => {
  const state = createState("singles");
  const view = renderWithApp(SinglesConfigWindow, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(state as never) },
      stubs: { VSelect: SelectStub(), AdminSyncImportCard: true, SinglesCsvImportDialog: true }
    }
  });
  expect(view.container.querySelector(".whatnot-fee-summary")).not.toBeNull();
  expect(view.container.textContent).toContain("7.5");
  expect(screen.queryByRole("button", { name: "configWhatnotVerticalLabel" })).toBeNull();
  state.whatnotVertical = "fashion";
  state.lots[0]!.whatnotVertical = "fashion";
  await vi.waitFor(() => expect(view.container.textContent).toContain("6.5"));
  state.whatnotFeeSummary = { ...summary, currentPeriodGrossCad: 90_000, nextThresholdCad: null };
  await vi.waitFor(() => expect(view.container.textContent).toContain("configWhatnotFeeStatusMaxTier"));
  expect(view.container.querySelector(".whatnot-fee-summary__bar")).toBeNull();
  expect(view.container.querySelector(".whatnot-fee-summary")?.classList.contains("mt-3")).toBe(false);
  state.feeProfilePreset = "none";
  await vi.waitFor(() => expect(view.container.querySelector(".whatnot-fee-summary")).toBeNull());
  expect(screen.queryByRole("button", { name: "configWhatnotVerticalLabel" })).toBeNull();
});
