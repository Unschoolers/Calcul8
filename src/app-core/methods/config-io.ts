import type { AppContext } from "../context.ts";
import { type ConfigMethodSubset } from "./config-shared.ts";

function sanitizeTsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return success;
}

function buildPortfolioReportTsv(context: AppContext): string {
  const exportedAt = new Date().toISOString();
  const totals = context.portfolioTotals;
  const lines: string[] = [
    `Report\t${sanitizeTsvCell("WhatFees Portfolio")}`,
    `Exported At\t${sanitizeTsvCell(exportedAt)}`,
    "",
    "Section\tLot Count\tProfitable Lots\tSales Count\tTotal Revenue\tTotal Cost\tTotal Profit",
    `Totals\t${totals.lotCount}\t${totals.profitableLotCount}\t${totals.totalSalesCount}\t${context.formatCurrency(totals.totalRevenue)}\t${context.formatCurrency(totals.totalCost)}\t${context.formatCurrency(totals.totalProfit)}`,
    "",
    "Lot\tType\tSales\tSold Items\tTotal Items\tRevenue\tCost\tProfit\tMargin %\tLast Sale"
  ];

  for (const row of context.allLotPerformance) {
    lines.push(
      [
        sanitizeTsvCell(row.lotName),
        sanitizeTsvCell(row.lotType),
        row.salesCount,
        row.soldPacks,
        row.totalPacks,
        context.formatCurrency(row.totalRevenue),
        context.formatCurrency(row.totalCost),
        context.formatCurrency(row.totalProfit),
        row.marginPercent == null ? "" : context.formatCurrency(row.marginPercent, 2),
        row.lastSaleDate ? sanitizeTsvCell(context.formatDate(row.lastSaleDate)) : ""
      ].join("\t")
    );
  }

  return lines.join("\n");
}

export const configIoMethods: ConfigMethodSubset<
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
> = {
  exportSales(): void {
    if (this.sales.length === 0) return this.notify("No sales to export", "warning");

    const dataStr = JSON.stringify(this.sales, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `rtyh-sales-${this.currentLotId}-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
    this.notify("Sales exported", "success");
  },

  exportPortfolioReport(): void {
    this.openPortfolioReportModal();
  },

  openPortfolioReportModal(): void {
    if (!this.hasPortfolioData) {
      this.notify("No portfolio data yet", "warning");
      return;
    }
    this.showPortfolioReportModal = true;
  },

  async copyPortfolioReportTable(): Promise<void> {
    if (!this.hasPortfolioData) {
      this.notify("No portfolio data yet", "warning");
      return;
    }

    const tsv = buildPortfolioReportTsv(this);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const copied = fallbackCopyToClipboard(tsv);
        if (!copied) throw new Error("Clipboard copy fallback failed");
      }
      this.notify("Portfolio table copied. Paste into Sheets or Excel.", "success");
    } catch (error) {
      console.warn("Failed to copy portfolio table:", error);
      this.notify("Could not copy table. Please try again.", "error");
    }
  }
};
