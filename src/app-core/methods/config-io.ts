import type { AppContext } from "../context.ts";
import { canUseAuthoritativeSalesLiveApi, fetchAuthoritativeSales } from "./sales-live-api.ts";
import { type ConfigMethodSubset } from "./config-shared.ts";
import {
  fetchWithRetry,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl
} from "./ui/shared.ts";
import { buildAuthenticatedHeaders } from "../auth/index.ts";
import { getScopedSyncClientVersionKey } from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";

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
  const exportedDateOnly = exportedAt.slice(0, 10);
  const totals = context.portfolioTotals;
  const lines: string[] = [
    `Report\t${sanitizeTsvCell("WhatFees Portfolio")}`,
    `Data Analysis On\t${sanitizeTsvCell(context.formatDate(exportedDateOnly))}`,
    `Exported At\t${sanitizeTsvCell(exportedAt)}`,
    "",
    "Section\tLot Count\tProfitable Lots\tSales Count\tTotal Revenue\tTotal Cost\tTotal Profit",
    `Totals\t${totals.lotCount}\t${totals.profitableLotCount}\t${totals.totalSalesCount}\t${context.formatCurrency(totals.totalRevenue)}\t${context.formatCurrency(totals.totalCost)}\t${context.formatCurrency(totals.totalProfit)}`,
    "",
    "Lot\tType\tRealized Status\tSales\tSold Items\tTotal Items\tSold Revenue\tSold Cost\tRealized Profit\tCurrent Lot P/L\tSold Margin %\tForecast Avg\tLast Sale"
  ];

  for (const row of context.allLotPerformance) {
    lines.push(
      [
        sanitizeTsvCell(row.lotName),
        sanitizeTsvCell(row.lotType),
        row.salesCount > 0 ? "Realized sales" : "No sales yet",
        row.salesCount,
        row.soldPacks,
        row.totalPacks,
        context.formatCurrency(row.totalRevenue),
        row.salesCount > 0 ? context.formatCurrency(row.realizedCost ?? 0) : "",
        row.salesCount > 0 ? context.formatCurrency(row.realizedProfit ?? 0) : "",
        context.formatCurrency(row.totalProfit),
        row.salesCount > 0 && row.realizedMarginPercent != null ? context.formatCurrency(row.realizedMarginPercent, 2) : "",
        row.forecastProfitAverage == null ? "" : context.formatCurrency(row.forecastProfitAverage),
        row.lastSaleDate ? sanitizeTsvCell(context.formatDate(row.lastSaleDate)) : ""
      ].join("\t")
    );
  }

  return lines.join("\n");
}

async function hydrateImportedAuthoritativeSales(context: AppContext): Promise<void> {
  if (!canUseAuthoritativeSalesLiveApi()) return;

  const lotIds = Array.from(
    new Set(
      (Array.isArray(context.lots) ? context.lots : [])
        .map((lot) => Number(lot?.id))
        .filter((lotId) => Number.isFinite(lotId) && lotId > 0)
    )
  );
  if (lotIds.length === 0) return;

  for (const lotId of lotIds) {
    try {
      const sales = await fetchAuthoritativeSales(context, lotId);
      if (lotId === context.currentLotId && Array.isArray(sales)) {
        context.sales = sales;
      }
    } catch (error) {
      console.warn("Failed to hydrate imported lot sales", error);
    }
  }
}

export const configIoMethods: ConfigMethodSubset<
  | "canUseAdminLotSyncTools"
  | "importLotsFromUserId"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "savePortfolioReportTable"
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
      const requestUrl = `${baseUrl}/ops/sync/import-user`;
      const response = await fetchWithRetry(requestUrl, {
        method: "POST",
        headers: buildAuthenticatedHeaders("session-preferred", {
          "Content-Type": "application/json"
        }, requestUrl),
        body: JSON.stringify({
          sourceUserId
        })
      });

      if (response.status === 401) {
        handleExpiredAuth(this);
        this.notify("Your sign-in expired. Please sign in again.", "warning");
        return;
      }

      let responsePayload: { error?: string; version?: number } | null = null;
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

      const importedVersion = Number(responsePayload?.version);
      if (Number.isFinite(importedVersion) && importedVersion > 0) {
        try {
          localStorage.setItem(
            getScopedSyncClientVersionKey(getActiveStorageScope(this)),
            String(Math.floor(importedVersion))
          );
        } catch {
          // Ignore storage failures and continue with the forced pull.
        }
      }

      this.notify(`Imported cloud sync data from user ${sourceUserId}.`, "success");
      await this.pullCloudSync(true);
      await hydrateImportedAuthoritativeSales(this);
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
      this.portfolioReportExpandedLotIds = [];
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
    },

    savePortfolioReportTable(): void {
      if (!this.hasPortfolioData) {
        this.notify("No portfolio data yet", "warning");
        return;
      }

      const tsv = buildPortfolioReportTsv(this);
      const exportedDateOnly = new Date().toISOString().slice(0, 10);
      const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `whatfees-portfolio-report-${exportedDateOnly}.tsv`;
        link.click();
        this.notify("Portfolio report saved.", "success");
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  };
