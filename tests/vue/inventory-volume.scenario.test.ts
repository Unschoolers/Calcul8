import { fireEvent, within } from "@testing-library/vue";
import { computed, nextTick, reactive } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { singlesComputed } from "../../src/app-core/computed/singles.ts";
import { uiBaseMethods } from "../../src/app-core/methods/ui/common/base.ts";
import { createSinglesConfigPorts, singlesConfigPortsKey } from "../../src/components/windows/singles/singlesConfigPorts.ts";
import SinglesConfigWindow from "../../src/components/windows/singles/SinglesConfigWindow.vue";
import { vuetify } from "../../src/vuetify.ts";
import { createDenseVolumeFixture } from "../helpers/volume-fixtures.ts";
import { renderWithApp } from "./render.ts";

const originalWidth = window.innerWidth;
const originalTheme = vuetify.theme.global.name.value;

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  vuetify.display.update();
  vuetify.theme.change(originalTheme);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountInventory(width: number, language: "en" | "fr-CA") {
  const { lot, sales, targets } = createDenseVolumeFixture();
  const secondLot = { ...lot, id: lot.id + 1, name: "Control lot", singlesPurchases: [lot.singlesPurchases![0]!] };
  const emptyLot = { ...lot, id: lot.id + 2, name: "Empty lot", singlesPurchases: [] };
  let source: Record<string, any>;
  source = reactive({
    ...createInitialState(),
    currentLotId: lot.id,
    currentLotType: "singles",
    currentLotCatalogSource: "none",
    currentLotName: lot.name,
    preferredLanguage: language,
    lots: [lot, secondLot, emptyLot],
    sales,
    singlesPurchases: lot.singlesPurchases!,
    singlesSoldCountByPurchaseId: computed((): Record<number, number> => singlesComputed.singlesSoldCountByPurchaseId.call(source as never)),
    sellingCurrency: "CAD",
    currency: "CAD",
    exchangeRate: 1,
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
    t: (key: string) => uiBaseMethods.t.call(source as never, key, undefined),
    onPurchaseConfigChange: vi.fn(),
    notify: vi.fn(),
    askConfirmation: vi.fn()
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  vuetify.display.width.value = width;
  vuetify.display.update();
  const view = renderWithApp(SinglesConfigWindow, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never) },
      stubs: { AdminSyncImportCard: true, SinglesCsvImportDialog: true }
    }
  });
  const card = view.container.querySelector(".singles-grid-card") as HTMLElement;
  return { ...view, card, source, targets, lot, sales, secondLot, emptyLot };
}

test("mobile inventory restarts at 30 rows when returning from a smaller or empty lot", async () => {
  vuetify.theme.change("unionArenaDark");
  const { card, source, lot, sales, secondLot, emptyLot } = mountInventory(390, "fr-CA");
  const scope = within(card);
  await fireEvent.click(scope.getByRole("button", { name: /Charger 30 de plus/ }));
  await fireEvent.click(scope.getByRole("button", { name: /Charger 30 de plus/ }));
  expect(scope.getAllByRole("listitem")).toHaveLength(90);

  source.currentLotId = secondLot.id;
  source.singlesPurchases = secondLot.singlesPurchases!;
  source.sales = [];
  await nextTick();
  source.currentLotId = lot.id;
  source.singlesPurchases = lot.singlesPurchases!;
  source.sales = sales;
  await nextTick();
  expect(scope.getAllByRole("listitem")).toHaveLength(30);
  expect(card.querySelector(".singles-mobile-list .singles-mobile-number")).toHaveTextContent("V-0501");
  expect(card.querySelector(".singles-mobile-toolbar-count")).toHaveTextContent("500 items");

  await fireEvent.click(scope.getByRole("button", { name: /Charger 30 de plus/ }));
  await fireEvent.click(scope.getByRole("button", { name: /Charger 30 de plus/ }));
  expect(scope.getAllByRole("listitem")).toHaveLength(90);
  source.currentLotId = emptyLot.id;
  source.singlesPurchases = [];
  source.sales = [];
  await nextTick();
  expect(scope.queryAllByRole("listitem")).toHaveLength(0);
  source.currentLotId = lot.id;
  source.singlesPurchases = lot.singlesPurchases!;
  source.sales = sales;
  await nextTick();
  expect(scope.getAllByRole("listitem")).toHaveLength(30);
  expect(card.querySelector(".singles-mobile-list .singles-mobile-number")).toHaveTextContent("V-0501");
  expect(source.singlesPurchases).toHaveLength(1_000);
});

function rowWith(container: ParentNode, itemNumber: number): Element | undefined {
  return Array.from(container.querySelectorAll(".singles-desktop-row"))
    .find((row) => row.textContent?.includes(`V-${String(itemNumber).padStart(4, "0")}`));
}

test("mobile inventory searches the full filtered collection, toggles sold stock, and paginates without identity loss", async () => {
  vuetify.theme.change("unionArenaDark");
  const { card, source, targets, lot } = mountInventory(390, "fr-CA");
  const scope = within(card);
  const search = scope.getByPlaceholderText("Rechercher par nom ou numéro d’item") as HTMLInputElement;
  expect(source.singlesSoldCountByPurchaseId[20_000]).toBe(1);
  expect(source.singlesSoldCountByPurchaseId[20_999]).toBe(1);
  expect(card.querySelectorAll(".singles-mobile-item")).toHaveLength(30);

  await fireEvent.update(search, "V-1000");
  expect(card.querySelector(".singles-mobile-list .singles-mobile-name")).toHaveTextContent("ZZZ — Recherche ciblée, dernière ligne du lot");
  expect(card.querySelector(".singles-mobile-list .singles-mobile-chip--stock")).toHaveTextContent("1/2");
  await fireEvent.update(search, "v-1000 zzz");
  expect(card.querySelector(".singles-mobile-list .singles-mobile-name")).toHaveTextContent("ZZZ — Recherche ciblée, dernière ligne du lot");
  await fireEvent.update(search, "absent volume token");
  expect(scope.getByText("Aucune ligne ne correspond à cette recherche. Essayez un autre nom ou numéro d’item.")).toBeVisible();
  await fireEvent.update(search, "V-0001");
  expect(scope.getByText("Aucune ligne ne correspond à cette recherche. Essayez un autre nom ou numéro d’item.")).toBeVisible();
  const soldToggle = scope.getByRole("button", { name: "Basculer l’affichage des items épuisés" });
  await fireEvent.click(soldToggle);
  expect(card.querySelector(".singles-mobile-list .singles-mobile-name")).toHaveTextContent("Édition spéciale — Collection complète de Montréal #1");
  expect(card.querySelector(".singles-mobile-list .singles-mobile-chip--stock")).toHaveTextContent("0/1");
  await fireEvent.click(soldToggle);
  expect(scope.getByText("Aucune ligne ne correspond à cette recherche. Essayez un autre nom ou numéro d’item.")).toBeVisible();

  await fireEvent.update(search, "");
  expect(scope.getAllByRole("listitem")).toHaveLength(30);
  const more = scope.getByRole("button", { name: /Charger 30 de plus/ });
  await fireEvent.click(more);
  expect(scope.getAllByRole("listitem")).toHaveLength(60);
  await fireEvent.click(scope.getByRole("button", { name: /Charger 30 de plus/ }));
  expect(scope.getAllByRole("listitem")).toHaveLength(90);
  await fireEvent.update(search, "Recherche ciblée");
  expect(scope.getAllByRole("listitem")).toHaveLength(1);
  await fireEvent.update(search, "");
  expect(scope.getAllByRole("listitem")).toHaveLength(30);
  expect(card.querySelector(".singles-mobile-toolbar-count")).toHaveTextContent("500 items");
  await fireEvent.click(scope.getByRole("button", { name: "Basculer l’affichage des items épuisés" }));
  expect(scope.getAllByRole("listitem")).toHaveLength(30);
  expect(card.querySelector(".singles-mobile-toolbar-count")).toHaveTextContent("1000 items");
  await fireEvent.click(scope.getByRole("button", { name: "Basculer l’affichage des items épuisés" }));
  expect(card.querySelector(".singles-mobile-toolbar-count")).toHaveTextContent("500 items");
  expect(source.singlesPurchases).toHaveLength(1_000);
  expect(lot.singlesPurchases).toHaveLength(1_000);
  expect(targets.finalItemId).toBe(20_999);
});

test("desktop inventory virtualizes the true first and last windows and opens the matching item editor", async () => {
  vuetify.theme.change("unionArenaLight");
  const { card, source, targets, lot, sales, secondLot } = mountInventory(1280, "en");
  const scope = within(card);
  const search = scope.getByPlaceholderText("Search by item name or number") as HTMLInputElement;
  const firstWindow = card.querySelectorAll(".singles-desktop-row");
  expect(firstWindow[0]?.textContent).toContain("V-0501");
  expect(firstWindow.length).toBeLessThan(30);
  expect(card.querySelector(".singles-grid-wrap")?.classList.contains("is-virtualized")).toBe(true);
  expect(rowWith(card, 501)).toBeDefined();
  expect(rowWith(card, 1_000)).toBeUndefined();

  const scroller = card.querySelector(".singles-grid-wrap") as HTMLElement;
  expect(51_440).toBe(500 * 104 - 560);
  scroller.scrollTop = 51_440;
  await fireEvent.scroll(scroller, { target: { scrollTop: scroller.scrollTop } });
  await nextTick();
  expect(rowWith(card, 1_000)).toBeDefined();
  expect(rowWith(card, 501)).toBeUndefined();

  source.currentLotId = secondLot.id;
  source.singlesPurchases = secondLot.singlesPurchases!;
  source.sales = [];
  await nextTick();
  expect(scroller.scrollTop).toBe(0);
  source.currentLotId = lot.id;
  source.singlesPurchases = lot.singlesPurchases!;
  source.sales = sales;
  await nextTick();
  expect(scroller.scrollTop).toBe(0);
  expect(rowWith(card, 501)).toBeDefined();
  expect(rowWith(card, 1_000)).toBeUndefined();
  expect(card.querySelector(".singles-desktop-grid tbody")?.firstElementChild).toHaveClass("singles-desktop-row");

  await fireEvent.update(search, "V-1000");
  const finalRow = rowWith(card, 1_000)!;
  expect(finalRow).toBeDefined();
  await fireEvent.click(finalRow);
  await nextTick();
  const editor = document.querySelector(".singles-editor-sheet-dialog");
  expect(editor).not.toBeNull();
  expect(editor).toHaveTextContent("ZZZ — Recherche ciblée, dernière ligne du lot");
  expect(editor).toHaveTextContent("V-1000");
  expect(editor?.querySelector<HTMLInputElement>("input[type='number']")?.value).toBe("2");
  await fireEvent.click(within(document.body).getByRole("button", { name: "Cancel" }));

  source.currentLotId = secondLot.id;
  source.singlesPurchases = secondLot.singlesPurchases!;
  source.sales = [];
  await nextTick();
  expect(card.querySelectorAll(".singles-desktop-row")).toHaveLength(0);
  expect(scope.getByPlaceholderText("Search by item name or number")).toHaveValue("V-1000");
  expect(scope.getByText("No rows match this search yet. Try another name or item number.")).toBeVisible();
  expect(lot.singlesPurchases).toHaveLength(1_000);
});
