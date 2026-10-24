import { fireEvent, screen } from "@testing-library/vue";
import { reactive } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import LiveSinglesPanel from "../../src/components/windows/live/LiveSinglesPanel.vue";
import { liveWindowPortsKey, type LiveWindowPorts } from "../../src/components/windows/live/liveWindowPorts.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { STORAGE_KEYS } from "../../src/app-core/storageKeys.ts";
import type { SinglesPurchaseEntry } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

const originalMode = localStorage.getItem(STORAGE_KEYS.LIVE_SINGLES_MODE);
afterEach(() => {
  if (originalMode == null) localStorage.removeItem(STORAGE_KEYS.LIVE_SINGLES_MODE);
  else localStorage.setItem(STORAGE_KEYS.LIVE_SINGLES_MODE, originalMode);
});

function entry(overrides: Partial<SinglesPurchaseEntry>): SinglesPurchaseEntry {
  return {
    id: 1,
    item: "Market item",
    cardNumber: "A-1",
    cost: 5,
    currency: "CAD",
    quantity: 3,
    marketValue: 10,
    ...overrides
  };
}

function renderPanel(entries: SinglesPurchaseEntry[]) {
  const openConvertLiveSinglesSaleModal = vi.fn();
  const clearLiveSinglesSelection = vi.fn();
  const translate = (key: string) => translateAppMessage("fr-CA", key);
  const ports = reactive({
    currentLotType: "singles",
    preferredLanguage: "fr-CA",
    singlesPurchases: entries,
    singlesSoldCountByPurchaseId: {},
    effectiveLiveSinglesIds: entries.map((item) => item.id),
    effectiveLiveSinglesEntries: entries,
    targetProfitPercent: 0,
    sellingShippingPerOrder: 0,
    sellingCurrency: "CAD",
    currency: "CAD",
    exchangeRate: 1,
    calculatePriceForUnits: (units: number, netRevenue: number) => netRevenue / units,
    netFromGross: (gross: number) => gross,
    formatCurrency: (value: number) => Number(value || 0).toFixed(2),
    safeFixed: (value: number, decimals = 2) => Number(value || 0).toFixed(decimals),
    rootTranslate: translate,
    rootFormatCurrency: (value: number, decimals = 2) => Number(value || 0).toFixed(decimals),
    t: translate,
    addLiveSinglesSelection: vi.fn(),
    removeLiveSinglesSelection: vi.fn(),
    clearLiveSinglesSelection,
    openConvertLiveSinglesSaleModal,
    resetLivePrices: vi.fn(),
    applyLivePricesToDefaults: vi.fn(),
    askConfirmation: vi.fn(),
    accessProFeature: vi.fn()
  });
  const view = renderWithApp(LiveSinglesPanel, {
    global: { provide: { [liveWindowPortsKey as symbol]: ports as unknown as LiveWindowPorts } }
  });
  return { view, openConvertLiveSinglesSaleModal, clearLiveSinglesSelection };
}

describe("live singles panel French behavior", () => {
  test("renders approved labels, counts quantity exactly, keeps individual mode and prepares the same sale line", async () => {
    const entries = [entry({ id: 1, item: "Market item", cost: 5, marketValue: 10 })];
    const { openConvertLiveSinglesSaleModal, clearLiveSinglesSelection } = renderPanel(entries);

    await fireEvent.click(screen.getByRole("button", { name: "Prix global" }));
    expect(screen.getByText("Items à tarifer")).toBeVisible();
    expect(screen.getByText("Valeur de référence $10.00")).toBeVisible();
    expect(screen.getAllByText("Prix global").length).toBeGreaterThan(0);
    expect(screen.getByText("1 item", { exact: true })).toBeVisible();

    await fireEvent.click(screen.getByRole("button", { name: "Individuel" }));
    expect(screen.getByText("1 item", { exact: true })).toBeVisible();
    expect(screen.getAllByText("Chaque").length).toBeGreaterThan(0);

    await fireEvent.click(screen.getAllByRole("button", { name: "Augmenter la quantité" })[0]!);
    expect(screen.getByText("2 items", { exact: true })).toBeVisible();

    await fireEvent.click(screen.getByRole("button", { name: "Préparer une vente" }));
    expect(openConvertLiveSinglesSaleModal).toHaveBeenCalledWith([
      { singlesPurchaseEntryId: 1, quantity: 2, price: 20 }
    ], { buyerShipping: 0 });
    expect(clearLiveSinglesSelection).not.toHaveBeenCalled();
  });

  test("uses cost when market value is not positive", async () => {
    const { openConvertLiveSinglesSaleModal } = renderPanel([
      entry({ id: 2, item: "Cost fallback", cost: 5, marketValue: 0, cardNumber: "B-2" })
    ]);

    expect(screen.getByText("Valeur de référence $5.00")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Préparer une vente" }));
    expect(openConvertLiveSinglesSaleModal).toHaveBeenCalledWith([
      { singlesPurchaseEntryId: 2, quantity: 1, price: 5 }
    ], { buyerShipping: 0 });
  });

  test("keeps multi-item global pricing allocations and quantities when preparing a sale", async () => {
    const { openConvertLiveSinglesSaleModal } = renderPanel([
      entry({ id: 1, item: "Market item", cost: 5, marketValue: 10 }),
      entry({ id: 2, item: "Cost fallback", cost: 5, marketValue: 0, cardNumber: "B-2" })
    ]);

    await fireEvent.click(screen.getByRole("button", { name: "Prix global" }));
    await fireEvent.click(screen.getAllByRole("button", { name: "Augmenter la quantité" })[0]!);
    expect(screen.getByText("3 items", { exact: true })).toBeVisible();
    await fireEvent.click(screen.getAllByRole("button", { name: "Augmenter le prix" })[0]!);

    await fireEvent.click(screen.getByRole("button", { name: "Préparer une vente" }));
    expect(openConvertLiveSinglesSaleModal).toHaveBeenCalledWith([
      { singlesPurchaseEntryId: 1, quantity: 2, price: 20.8 },
      { singlesPurchaseEntryId: 2, quantity: 1, price: 5.2 }
    ], { buyerShipping: 0 });
    const preparedLines = openConvertLiveSinglesSaleModal.mock.calls[0]?.[0] as Array<{ quantity: number; price: number }>;
    expect(preparedLines.reduce((sum, line) => sum + line.price, 0)).toBe(26);
  });
});
