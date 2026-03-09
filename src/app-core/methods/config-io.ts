import type { AppContext } from "../context.ts";
import { type ConfigMethodSubset } from "./config-shared.ts";
import {
  fetchWithRetry,
  GOOGLE_TOKEN_KEY,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl
} from "./ui/shared.ts";

const ADMIN_SYNC_USER_ID = "107850224060485991888";

function isAdminSyncImportEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_ADMIN_SYNC_IMPORT || "").trim().toLowerCase() === "true";
}

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
  | "canUseAdminLotSyncTools"
  | "importLotsFromUserId"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
> = {
  canUseAdminLotSyncTools(): boolean {
    if (!isAdminSyncImportEnabled()) return false;
    const cached = readEntitlementCache();
    return (cached?.userId ?? "") === ADMIN_SYNC_USER_ID;
  },

  async importLotsFromUserId(): Promise<void> {
    if (!this.canUseAdminLotSyncTools()) {
      this.notify("Forbidden.", "error");
      return;
    }
    if (this.isAdminImportInProgress) return;

    const sourceUserId = String(this.adminImportSourceUserId || "").trim();
    if (!sourceUserId) {
      this.notify("Enter a source userId first.", "warning");
      return;
    }
    if (!/^[A-Za-z0-9._:@-]{6,128}$/.test(sourceUserId)) {
      this.notify("Invalid source userId format.", "warning");
      return;
    }

    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) {
      this.notify("API base URL is not configured.", "error");
      return;
    }

    this.isAdminImportInProgress = true;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
      if (googleIdToken) {
        headers.Authorization = `Bearer ${googleIdToken}`;
      }

      const response = await fetchWithRetry(`${baseUrl}/ops/sync/import-user`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sourceUserId
        })
      });

      if (response.status === 401) {
        handleExpiredAuth(this);
        this.notify("Your sign-in expired. Please sign in again.", "warning");
        return;
      }

      let responsePayload: { error?: string } | null = null;
      try {
        responsePayload = (await response.json()) as { error?: string };
      } catch {
        responsePayload = null;
      }

      if (!response.ok) {
        const apiError = String(responsePayload?.error || "").trim();
        this.notify(
          apiError || `Import failed (${response.status}).`,
          "error"
        );
        return;
      }

      this.notify(`Imported cloud sync data from user ${sourceUserId}.`, "success");
      await this.pullCloudSync();
    } catch (error) {
      console.warn("Failed to import sync data from source user:", error);
      this.notify("Could not import sync data. Please try again.", "error");
    } finally {
      this.isAdminImportInProgress = false;
    }
  },

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
