import { fireEvent, screen } from "@testing-library/vue";
import { nextTick, reactive, ref } from "vue";
import { expect, test, vi, afterEach } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { createSinglesConfigPorts, singlesConfigPortsKey } from "../../src/components/windows/singles/singlesConfigPorts.ts";
import SinglesCsvImportDialog from "../../src/components/windows/singles/SinglesCsvImportDialog.vue";
import SinglesConfigWindow from "../../src/components/windows/singles/SinglesConfigWindow.vue";
import { vuetify } from "../../src/vuetify.ts";
import { renderWithApp } from "./render.ts";

const originalWidth = window.innerWidth;
const originalTheme = vuetify.theme.global.name.value;

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  window.dispatchEvent(new Event("resize"));
  vuetify.theme.change(originalTheme);
  vi.unstubAllGlobals();
});

function setViewport(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

function inventorySource(language: "en" | "fr-CA" = "fr-CA") {
  return reactive({
    ...createInitialState(),
    currentLotId: 1,
    lots: [{ id: 1, name: "Items", lotType: "singles", singlesCatalogSource: "pokemon" }],
    currentLotCatalogSource: "pokemon",
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    sellingCurrency: "CAD",
    exchangeRate: 1,
    preferredLanguage: language,
    currency: "CAD",
    conversionInfo: "",
    singlesPurchaseTotalCost: 0,
    singlesPurchaseTotalMarketValue: 0,
    showSinglesCsvMapperModal: false,
    singlesCsvImportHeaders: ["Name", "Qty"],
    singlesCsvImportRows: [],
    singlesCsvImportCurrency: "CAD",
    singlesCsvImportMode: "merge",
    singlesCsvMapItem: 0,
    singlesCsvMapCardNumber: null,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: 1,
    singlesCsvMapMarketValue: null,
    saveLotsToStorage: vi.fn(),
    removeSinglesPurchaseRow: vi.fn(),
    onSinglesPurchaseRowsChange: vi.fn(),
    importSinglesPurchasesCsv: vi.fn(),
    confirmSinglesPurchasesCsvImport: vi.fn(),
    cancelSinglesPurchasesCsvImport: vi.fn(),
    formatCurrency: (value: number | null | undefined) => String(value ?? 0),
    t: (key: string, params?: Record<string, string | number | null | undefined>) => translateAppMessage(language, key as never, params),
    onPurchaseConfigChange: vi.fn(),
    notify: vi.fn(),
    askConfirmation: vi.fn()
  });
}

test("French editor notifications and delete confirmation use the real inventory translator", async () => {
  const source = inventorySource();
  source.currentLotCatalogSource = "none" as never;
  source.lots[0]!.singlesCatalogSource = "none";
  source.singlesPurchases = [{ id: 42, item: "Pikachu", cardNumber: "001", condition: "Near Mint", language: "English", cost: 1, currency: "CAD", quantity: 1, marketValue: 1, marketValueCurrency: "CAD" }] as never[];
  setViewport(390);
  vuetify.theme.change("unionArenaDark");
  const editor = ref<Record<string, any>>();
  const Host = {
    components: { SinglesConfigWindow },
    setup: () => ({ editor }),
    template: "<singles-config-window ref='editor' />"
  };
  renderWithApp(Host, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never) },
      stubs: { AdminSyncImportCard: true }
    }
  });
  await nextTick();
  await fireEvent.click(document.querySelector(".singles-mobile-item")!);
  expect(screen.getByRole("textbox", { name: "Item" })).toBeVisible();
  const before = source.singlesPurchases;
  editor.value!.editingSinglesRow.item = "";
  editor.value!.saveSinglesRowEditor();
  expect(source.notify).toHaveBeenLastCalledWith("Le nom de l’item est obligatoire.", "warning");
  editor.value!.editingSinglesRow.item = "Pikachu";
  editor.value!.editingSinglesRow.cost = -1;
  editor.value!.saveSinglesRowEditor();
  expect(source.notify).toHaveBeenLastCalledWith("Entrez un coût égal ou supérieur à 0.", "warning");
  editor.value!.editingSinglesRow.cost = 0;
  editor.value!.editingSinglesRow.quantity = -1;
  editor.value!.saveSinglesRowEditor();
  expect(source.notify).toHaveBeenLastCalledWith("Entrez une quantité égale ou supérieure à 0.", "warning");
  expect(source.singlesPurchases).toBe(before);
  editor.value!.editingSinglesRow.cost = 0;
  editor.value!.editingSinglesRow.quantity = 0;
  editor.value!.saveSinglesRowEditor();
  expect(source.singlesPurchases).toHaveLength(1);
  expect(source.singlesPurchases[0]).toMatchObject({ item: "Pikachu", cost: 0, quantity: 0 });

  editor.value!.editingSinglesRowId = 42;
  editor.value!.confirmRemoveSinglesPurchaseRow(42, true);
  expect(source.askConfirmation).toHaveBeenCalledOnce();
  const [payload, action] = source.askConfirmation.mock.calls[0]!;
  expect(payload).toEqual({ title: "Supprimer cet item ?", text: "Supprimer cet achat d’item ?", color: "error" });
  action();
  expect(source.removeSinglesPurchaseRow).toHaveBeenCalledWith(42);
});

test("French CSV dialog shows translated mode and mapped preview labels while preserving sync value", async () => {
  const source = inventorySource();
  source.showSinglesCsvMapperModal = true;
  source.singlesCsvImportHeaders = ["", "Qty"];
  setViewport(390);
  vuetify.theme.change("unionArenaDark");
  renderWithApp(SinglesCsvImportDialog, {
    global: { provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never) } }
  });
  expect(screen.getByText("Mode d’importation")).toBeVisible();
  expect(screen.getByText("Associer les colonnes du CSV")).toBeVisible();
  const mappedPreviewHeader = document.querySelector(".singles-import-preview-table th");
  expect(mappedPreviewHeader).toHaveTextContent("Colonne 1");
  expect(mappedPreviewHeader).toHaveTextContent("Item");
  expect(screen.getAllByText("Item").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Quantité").length).toBeGreaterThan(0);
  await fireEvent.click(screen.getByRole("button", { name: "Remplacer" }));
  await nextTick();
  expect(source.singlesCsvImportMode).toBe("sync");
  expect(source.singlesCsvMapItem).toBe(0);
  expect(source.singlesCsvMapQuantity).toBe(1);
  expect(document.querySelector(".singles-csv-mobile-summary__chips")).toHaveTextContent("Remplacer · CAD");
  expect(screen.getByText(/Les items absents du fichier seront supprimés\./)).toBeVisible();
});

test("desktop selection count switches singular and plural after real row clicks", async () => {
  const source = inventorySource("en");
  setViewport(1024);
  vuetify.theme.change("unionArenaLight");
  source.singlesPurchases = [
    { id: 11, item: "Pikachu", cardNumber: "001", condition: "Near Mint", language: "English", cost: 1, currency: "CAD", quantity: 1, marketValue: 1, marketValueCurrency: "CAD" },
    { id: 12, item: "Eevee", cardNumber: "002", condition: "Near Mint", language: "English", cost: 2, currency: "CAD", quantity: 1, marketValue: 2, marketValueCurrency: "CAD" }
  ] as never[];
  const view = renderWithApp(SinglesConfigWindow, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never) },
      stubs: { AdminSyncImportCard: true }
    }
  });
  await fireEvent.click(screen.getByRole("button", { name: "Toggle multi-select mode" }));
  const rows = view.container.querySelectorAll(".singles-desktop-row");
  expect(rows).toHaveLength(2);
  await fireEvent.click(rows[0]!);
  expect(screen.getByText("1 item selected")).toBeVisible();
  await fireEvent.click(rows[1]!);
  expect(screen.getByText("2 items selected")).toBeVisible();
});
