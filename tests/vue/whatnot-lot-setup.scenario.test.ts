import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import type { WhatnotVertical } from "../../src/types/app.ts";
import { createConfigWindowPorts, configWindowPortsKey } from "../../src/components/windows/config/configWindowPorts.ts";
import ConfigWindow from "../../src/components/windows/config/ConfigWindow.vue";
import { createSinglesConfigPorts, singlesConfigPortsKey } from "../../src/components/windows/singles/singlesConfigPorts.ts";
import SinglesConfigWindow from "../../src/components/windows/singles/SinglesConfigWindow.vue";
import { renderWithApp } from "./render.ts";

const summary = {
  currentTier: 2, previousPeriodGrossCad: 22_500, currentPeriodGrossCad: 4_000,
  nextThresholdCad: 10_000, isEstimate: true, missingLotIds: [2],
  periodStart: "2026-09-21", periodEndExclusive: "2026-10-19",
  previousPeriodStart: "2026-08-24", previousPeriodEndExclusive: "2026-09-21"
};
const t = (key: string, values?: Record<string, unknown>) => `${key} ${Object.values(values ?? {}).join(" ")}`;

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
    currentLotId: 1,
    hasLotSelected: true,
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

test("bulk lot setup shows the legacy category hint and live Whatnot fee status", async () => {
  const state = createState("bulk", null);
  const view = renderWithApp(ConfigWindow, {
    global: {
      provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
      stubs: { VSelect: SelectStub(), AdminSyncImportCard: true }
    }
  });
  expect(await screen.findByText("configWhatnotVerticalLegacyHint")).toBeVisible();
  expect(screen.queryByText("configWhatnotFeeStatusTitle")).toBeNull();
  state.whatnotVertical = "tcg";
  await vi.waitFor(() => expect(view.container.textContent).toContain("configWhatnotFeeStatusTitle"));
  expect(view.container.textContent).toContain("configWhatnotFeeStatusProgress");
  expect(view.container.textContent).toContain("configWhatnotFeeStatusIncomplete");
});

test("singles category selection persists through its port and updates live rate; none still allows editing", async () => {
  const state = createState("singles");
  const view = renderWithApp(SinglesConfigWindow, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(state as never) },
      stubs: { VSelect: SelectStub(), AdminSyncImportCard: true, SinglesCsvImportDialog: true }
    }
  });
  expect(view.container.textContent).toContain("configWhatnotFeeStatusTitle");
  expect(view.container.textContent).toContain("7.5");
  await fireEvent.click(screen.getByRole("button", { name: "configWhatnotVerticalLabel" }));
  await vi.waitFor(() => expect(state.whatnotVertical).toBe("fashion"));
  expect(state.lots[0]?.whatnotVertical).toBe("fashion");
  await vi.waitFor(() => expect(view.container.textContent).toContain("6.5"));
  state.feeProfilePreset = "none";
  await vi.waitFor(() => expect(view.container.textContent).not.toContain("configWhatnotFeeStatusTitle"));
  expect(screen.getByRole("button", { name: "configWhatnotVerticalLabel" })).toBeVisible();
  state.whatnotVertical = "tcg";
  await fireEvent.click(screen.getByRole("button", { name: "configWhatnotVerticalLabel" }));
  await vi.waitFor(() => expect(state.lots[0]?.whatnotVertical).toBe("fashion"));
});
