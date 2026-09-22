import { readFileSync } from "node:fs";
import { fireEvent } from "@testing-library/vue";
import { defineComponent, nextTick, ref } from "vue";
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
    onPurchaseConfigChange: vi.fn(),
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

test("reproduces lowercase multi-star rarity typing in the mounted singles editor", async () => {
  const storage = new Map<string, string>([["whatfees_api_base_url", "https://api.example.test"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  let resolveSearch: ((response: Response) => void) | undefined;
  const pendingSearch = new Promise<Response>((resolve) => {
    resolveSearch = resolve;
  });
  const searchResponse = vi.fn().mockReturnValue(pendingSearch);
  vi.stubGlobal("fetch", searchResponse);
  const source = {
    ...createInitialState(),
    currentLotId: 1,
    lots: [{ id: 1, name: "Singles", lotType: "singles", singlesCatalogSource: "ua" }],
    currentLotCatalogSource: "ua",
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
    onPurchaseConfigChange: vi.fn(),
    notify: vi.fn(),
    askConfirmation: vi.fn()
  };
  const editor = ref<Record<string, any>>();
  const Host = defineComponent({
    components: { SinglesConfigWindow },
    setup: () => ({ editor }),
    template: "<singles-config-window ref=\"editor\" />"
  });
  renderWithApp(Host, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never) },
      stubs: { AdminSyncImportCard: true, SinglesCsvImportDialog: true }
    }
  });
  await nextTick();
  editor.value?.openSinglesRowEditor();
  await nextTick();
  const input = document.querySelector<HTMLInputElement>(".v-autocomplete input");
  expect(input).not.toBeNull();
  for (const value of ["G", "Go", "Gon", "Gon ", "Gon s", "Gon sr", "Gon sr*", "Gon sr**"]) {
    input!.value = value;
    await fireEvent(input!, new InputEvent("input", { bubbles: true, data: value.at(-1) ?? "" }));
  }
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledOnce(), { timeout: 1500 });
  const requestUrl = String(searchResponse.mock.calls[0]?.[0] || "");
  expect(requestUrl).toContain("q=Gon+sr**");
  expect(editor.value!.singlesItemMenuOpen).toBe(true);
  expect(document.querySelector(".singles-card-suggestions-menu")).toHaveTextContent("singlesEditorSearchingText");
  resolveSearch?.(new Response(JSON.stringify({
    items: [
      { name: "Gon Freecss", cardNo: "UE02BT/HTR-1-078-ALT1", rarity: "SR★★", marketPrice: 283.51 },
      { name: "Gon Freecss", cardNo: "UE02BT/HTR-1-078-ALT2", rarity: "SR★★★", marketPrice: 1053.57 },
      { name: "Gon Freecss", cardNo: "UEX04BT/HTR-2-016-ALT1", rarity: "SR★★", marketPrice: 196.23 }
    ]
  }), { status: 200 }));
  await vi.waitFor(() => expect(document.querySelector(".singles-card-suggestions-menu")).toHaveTextContent("Gon Freecss"));
});

test("uses an inset media dialog for the singles image preview", () => {
  const template = readFileSync("src/components/windows/singles/SinglesConfigWindow.html", "utf8");

  expect(template).toMatch(/<app-dialog-shell[\s\S]*v-model="showSinglesImagePreview"[\s\S]*variant="media"/);
  expect(template).not.toMatch(/<v-dialog\b/);
});

test("keeps the Singles row editor as a shared-contract bottom sheet", () => {
  const template = readFileSync("src/components/windows/singles/SinglesConfigWindow.html", "utf8");

  expect(template).toMatch(/<v-bottom-sheet[^>]*v-model="showSinglesRowEditor"/);
  expect(template).toMatch(/<v-bottom-sheet[\s\S]*app-overlay-frame[\s\S]*<app-form-layout[\s\S]*<app-sticky-action-footer/);
});
