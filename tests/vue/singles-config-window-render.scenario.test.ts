import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import {
    createSinglesConfigPorts,
    singlesConfigPortsKey
} from "../../src/components/windows/singles/singlesConfigPorts.ts";
import SinglesConfigWindow from "../../src/components/windows/singles/SinglesConfigWindow.vue";
import { renderWithApp } from "./render.ts";

test("singles window renders its purchasing view through injected ports", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  });
  const source = {
    ...createInitialState(),
    currentLotId: 1,
    lots: [{ id: 1, name: "Singles", lotType: "singles", singlesCatalogSource: "pokemon" }],
    currentLotCatalogSource: "pokemon",
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    sellingCurrency: "CAD",
    exchangeRate: 1,
    preferredLanguage: "en",
    currency: "CAD",
    conversionInfo: "",
    singlesPurchaseTotalCost: 0,
    singlesPurchaseTotalMarketValue: 0,
    saveLotsToStorage: vi.fn(),
    removeSinglesPurchaseRow: vi.fn(),
    onSinglesPurchaseRowsChange: vi.fn(),
    importSinglesPurchasesCsv: vi.fn(),
    confirmSinglesPurchasesCsvImport: vi.fn(),
    cancelSinglesPurchasesCsvImport: vi.fn(),
    formatCurrency: (value: number | null | undefined) => String(value ?? 0),
    t: (key: string) => key,
    notify: vi.fn(),
    askConfirmation: vi.fn()
  };

  const view = renderWithApp(SinglesConfigWindow, {
    global: {
      provide: {
        [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never)
      },
      stubs: {
        AdminSyncImportCard: true,
        SinglesCsvImportDialog: true
      }
    }
  });

  expect(view.container.querySelector(".singles-grid-card")).not.toBeNull();
});