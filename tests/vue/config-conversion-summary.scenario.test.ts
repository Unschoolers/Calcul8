import { screen } from "@testing-library/vue";
import { reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { configWindowPortsKey, createConfigWindowPorts } from "../../src/components/windows/config/configWindowPorts.ts";
import ConfigWindow from "../../src/components/windows/config/ConfigWindow.vue";
import { renderWithApp } from "./render.ts";

test("purchase conversion summary is visible in Simple mode", () => {
  const state = reactive({
    ...createInitialState(),
    currentLotId: 1,
    hasLotSelected: true,
    lots: [{ id: 1, name: "Test lot", lotType: "bulk" }],
    purchaseUiMode: "simple",
    conversionInfo: "Purchase entered in USD. Rate: 1 USD = 1.40 CAD. Converted subtotal: 140.00 CAD.",
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    t: (key: string) => key,
    formatCurrency: (value: number | null | undefined) => String(value ?? 0),
    formatDate: (value: string) => value,
    onPurchaseConfigChange: vi.fn(),
    updatePurchaseCostInput: vi.fn(),
    requestPurchaseUiMode: vi.fn()
  });

  renderWithApp(ConfigWindow, {
    global: {
      provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
      stubs: { AdminSyncImportCard: true }
    }
  });

  expect(screen.getByText(state.conversionInfo)).toBeVisible();
});
