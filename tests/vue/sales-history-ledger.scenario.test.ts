import { fireEvent, screen, within } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import Ledger from "../../src/components/windows/sales/SalesHistoryLedger.vue";
import { vuetify } from "../../src/vuetify.ts";
import en from "../../src/app-core/i18n/locales/en/sales.json";
import fr from "../../src/app-core/i18n/locales/fr/sales.json";
import { renderWithApp } from "./render.ts";

for (const theme of ["unionArenaLight", "unionArenaDark"]) {
  for (const locale of [en, fr]) {
    describe(`${theme} ${locale.salesHistoryTypeItemLabel}`, () => {
      test("labels prices, sorts, opens buyers and keeps menu actions separate from row editing", async () => {
        vuetify.theme.change(theme);
        const edit = vi.fn(), remove = vi.fn(), buyer = vi.fn();
        const sales = [
          { id: 1, type: "pack", quantity: 1, price: 9, date: "2026-04-01", customer: "Julien" },
          { id: 2, type: "pack", quantity: 5, price: 20, priceIsTotal: true, date: "2026-05-01", customer: "" }
        ];
        const { container } = renderWithApp(Ledger, { props: {
          sales, t: (key: string) => (locale as Record<string, string>)[key] || key,
          formatDate: (date: string) => date, fmtCurrency: (n: number) => n.toFixed(2), fmtUnits: String,
          getSaleIcon: () => "mdi-tag", getSaleColor: () => "primary", calculateSaleProfit: () => 5,
          getSaleProfitPreview: () => null, isUnlinkedSinglesSale: () => false,
          onEdit: edit, onDelete: remove, "onOpen-buyer": buyer
        } });
        expect(container.querySelector(`.v-theme--${theme}`)).not.toBeNull();
        const rows = () => Array.from(container.querySelectorAll(".sales-history-ledger__row"));
        expect(rows()[0]).toHaveTextContent(locale.salesHistoryTypeSinglesLabel);
        expect(rows()[0]).toHaveTextContent(locale.salesHistoryTotalLabel);
        expect(rows()[0].querySelector(".sales-history-ledger__profit-value")).toHaveTextContent("+5.00");
        expect(rows()[1]).toHaveTextContent(locale.salesHistoryPerItemLabel);
        expect(screen.queryByText(locale.salesHistoryNoCustomerLabel)).toBeNull();
        await fireEvent.update(screen.getByRole("combobox"), "date:asc");
        expect(rows()[0]).toHaveTextContent("Julien");
        const customer = container.querySelector(".sales-history-ledger__customer-button")!;
        await fireEvent.keyDown(customer, { key: "Enter" });
        await fireEvent.click(customer);
        expect(buyer).toHaveBeenCalledWith("Julien");
        expect(edit).not.toHaveBeenCalled();
        await fireEvent.click(within(rows()[0] as HTMLElement).getByRole("button", { name: locale.salesHistoryActionsLabel }));
        await fireEvent.click(await screen.findByText(locale.salesHistoryDeleteSaleLabel));
        expect(remove).toHaveBeenCalledWith(1);
        expect(edit).not.toHaveBeenCalled();
        await fireEvent.keyDown(rows()[0], { key: "Enter" });
        expect(edit).toHaveBeenCalledWith(sales[0]);
      });
    });
  }
}
