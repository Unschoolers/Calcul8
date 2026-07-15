import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import SalesHistoryLedger from "../../src/components/windows/sales/SalesHistoryLedger.vue";
import WheelActionRail from "../../src/components/windows/game/stage/WheelActionRail.vue";
import PortfolioPerformanceGrid from "../../src/components/windows/portfolio/PortfolioPerformanceGrid.vue";
import AppConfirmDialog from "../../src/components/ui/AppConfirmDialog.vue";
import { renderWithApp } from "./render.ts";

const words: Record<string, string> = {
  salesHistorySortLabel: "Sort sales", salesHistorySortUnitsLabel: "Units", salesHistorySortTypeLabel: "Type", salesHistorySortPriceLabel: "Price",
  salesHistorySortProfitLabel: "Profit", salesHistorySortDateLabel: "Date", salesHistorySortCustomerLabel: "Customer", salesHistoryColumnUnitsLabel: "Units",
  salesHistoryColumnTypeLabel: "Type", salesHistoryColumnPriceLabel: "Price", salesHistoryColumnProfitLabel: "Profit", salesHistoryColumnDateLabel: "Date",
  salesHistoryColumnCustomerLabel: "Customer", salesHistoryTypeSinglesLabel: "Pack", salesHistoryNoCustomerLabel: "No customer", buyerQuickViewOpenLabel: "Open buyer",
  salesHistoryDeleteSaleLabel: "Delete sale", salesHistoryLoadMoreLabel: "Load", salesHistoryMoreLabel: "more", salesHistoryRemainingLabel: "remaining", salesProfitVsLabel: "vs"
};
const t = (key: string) => words[key] ?? key;

function renderLedger() {
  const onEdit = vi.fn(); const onDelete = vi.fn(); const onOpenBuyer = vi.fn(); const onLoadMore = vi.fn();
  const view = renderWithApp(SalesHistoryLedger, { props: {
    sales: [
      { id: 1, type: "pack", quantity: 1, price: 10, date: "2026-07-01", customer: "Zoe" },
      { id: 2, type: "pack", quantity: 3, price: 30, date: "2026-07-02", customer: "Amy" }
    ], hasMore: true, nextBatchCount: 2, remainingCount: 4, t, formatDate: (date: string) => date, fmtCurrency: (value: number) => value.toFixed(2),
    fmtUnits: (value: number) => String(value), getSaleIcon: () => "mdi-cards", getSaleColor: () => "primary", calculateSaleProfit: (sale: any) => sale.price - 5,
    getSaleProfitPreview: (sale: any) => ({ value: sale.price - 5, sign: "+", basisLabel: "cost" }), isUnlinkedSinglesSale: () => false,
    onEdit, onDelete, onOpenBuyer, onLoadMore
  } });
  return { view, onEdit, onDelete, onOpenBuyer, onLoadMore };
}

describe("sales ledger scenarios", () => {
  test("sorts visible rows by price", async () => {
    renderLedger();
    await fireEvent.click(screen.getAllByRole("button", { name: "Price" })[0]!);
    expect(screen.getAllByRole("row")[1]?.textContent).toContain("30.00");
  });
  test("opens the selected sale for editing", async () => {
    const { onEdit } = renderLedger();
    await fireEvent.click(screen.getAllByRole("row")[1]!);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
  test("opens buyer quick view for a named customer", async () => {
    const { onOpenBuyer } = renderLedger();
    await fireEvent.click(screen.getAllByRole("button", { name: "Open buyer" })[0]!);
    expect(onOpenBuyer).toHaveBeenCalledWith("Amy");
  });
  test("deletes the selected sale", async () => {
    const { onDelete } = renderLedger();
    await fireEvent.click(screen.getAllByRole("button", { name: "Delete sale" })[0]!);
    expect(onDelete).toHaveBeenCalledWith(2);
  });
  test("requests the next ledger page", async () => {
    const { onLoadMore } = renderLedger();
    await fireEvent.click(screen.getByRole("button", { name: /Load/ }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});

describe("wheel action scenarios", () => {
  function renderRail(overrides: Record<string, unknown> = {}) {
    const onPrimarySpin = vi.fn(); const onResetSession = vi.fn(); const onSecondaryAction = vi.fn();
    const view = renderWithApp(WheelActionRail, { props: { primaryIcon: "mdi-play", primaryLabel: "Spin", resetLabel: "Reset", showSecondary: true, secondaryLabel: "Toggle", onPrimarySpin, onResetSession, onSecondaryAction, ...overrides } });
    return { view, onPrimarySpin, onResetSession, onSecondaryAction };
  }
  test("spins from the primary action", async () => { const { onPrimarySpin } = renderRail(); await fireEvent.click(screen.getByRole("button", { name: "Spin" })); expect(onPrimarySpin).toHaveBeenCalledOnce(); });
  test("resets a session from its labelled action", async () => { const { onResetSession } = renderRail(); await fireEvent.click(screen.getByRole("button", { name: "Reset" })); expect(onResetSession).toHaveBeenCalledOnce(); });
  test("runs the secondary action", async () => { const { onSecondaryAction } = renderRail(); await fireEvent.click(screen.getByRole("button", { name: "Toggle" })); expect(onSecondaryAction).toHaveBeenCalledOnce(); });
  test("does not allow a disabled spin", () => { renderRail({ primaryDisabled: true }); expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled(); });
});

describe("portfolio and confirmation scenarios", () => {
  test("emits the selected portfolio sort", async () => {
    const onSort = vi.fn(); renderWithApp(PortfolioPerformanceGrid, { props: { columns: [{ key: "profit", label: "Profit", numeric: true }], sortOptions: [{ key: "profit", label: "Profit" }], activeSortKey: "profit", sortDirection: "desc", sortLabel: "Sort portfolio", onSort } });
    await fireEvent.click(screen.getAllByRole("button", { name: /Profit/ })[0]!);
    expect(onSort).toHaveBeenCalledWith("profit");
  });
  test("cancels a confirmation without confirming", async () => {
    const onCancel = vi.fn(); const onConfirm = vi.fn(); renderWithApp(AppConfirmDialog, { props: { modelValue: true, title: "Delete", body: "Delete this sale?", cancelText: "Cancel", confirmText: "Delete", onCancel, onConfirm } });
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled();
  });
  test("emits confirmation for an enabled destructive action", async () => {
    const onConfirm = vi.fn(); renderWithApp(AppConfirmDialog, { props: { modelValue: true, title: "Delete", confirmText: "Delete", onConfirm } });
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  test("keeps disabled confirmation unavailable", () => {
    renderWithApp(AppConfirmDialog, { props: { modelValue: true, title: "Delete", confirmText: "Delete", confirmDisabled: true } });
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
