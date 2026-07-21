import type { LotIoContext } from "../context/commerce.ts";
import type {
  ConfigIoMethodImplementation,
  PortfolioReportContext
} from "../context/portfolio.ts";
import { canUseAuthoritativeSalesLiveApi } from "./entity-api-shared.ts";
import { fetchAuthoritativeAllSales, fetchAuthoritativeSales } from "./lot-sales-api.ts";
import {
  fetchWithRetry,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl
} from "./ui/common/shared.ts";
import { buildAuthenticatedHeaders } from "../auth/index.ts";
import { clearScopedSyncDataStorage, getScopedSyncClientVersionKey } from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import { replaceRootLotSales } from "../shared/sales-root-state.ts";
import { applyCloudSnapshotToLocal, parseCloudSnapshot } from "./ui/sync/sync-apply.ts";

const ADMIN_SYNC_USER_ID = "107850224060485991888";
const ADMIN_SYNC_WORKSPACE_ID_REGEX = /^[A-Za-z0-9:_-]{1,128}$/;

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

function buildPortfolioReportTsv(context: PortfolioReportContext): string {
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

async function hydrateImportedAuthoritativeSales(context: LotIoContext): Promise<void> {
  if (!canUseAuthoritativeSalesLiveApi()) return;

  const lotIds = Array.from(
    new Set(
      (Array.isArray(context.lots) ? context.lots : [])
        .map((lot) => Number(lot?.id))
        .filter((lotId) => Number.isFinite(lotId) && lotId > 0)
    )
  );
  if (lotIds.length === 0) return;

  let refreshedAnySalesCache = false;
  try {
    const salesByLot = await fetchAuthoritativeAllSales(context, lotIds);
    if (salesByLot) {
      for (const lotId of lotIds) {
        const sales = salesByLot.get(lotId);
        if (!Array.isArray(sales)) continue;
        replaceRootLotSales(context, lotId, sales);
        refreshedAnySalesCache = true;
      }
      if (refreshedAnySalesCache) {
        context.salesCacheEpoch += 1;
      }
      return;
    }
  } catch (error) {
    console.warn("Failed to hydrate imported lot sales in bulk", error);
  }

  for (const lotId of lotIds) {
    try {
      const sales = await fetchAuthoritativeSales(context, lotId);
      if (Array.isArray(sales)) {
        replaceRootLotSales(context, lotId, sales);
        refreshedAnySalesCache = true;
      }
    } catch (error) {
      console.warn("Failed to hydrate imported lot sales", error);
    }
  }
  if (refreshedAnySalesCache) {
    context.salesCacheEpoch += 1;
  }
}

export const configIoMethods = {
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
    const sourceWorkspaceId = String(this.adminImportSourceWorkspaceId || "").trim();
    if (sourceWorkspaceId && !ADMIN_SYNC_WORKSPACE_ID_REGEX.test(sourceWorkspaceId)) {
      this.notify("Invalid source workspaceId format.", "warning");
      return;
    }

    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) {
      this.notify("API base URL is not configured.", "error");
      return;
    }

    this.isAdminImportInProgress = true;
    try {
      const activeScope = getActiveStorageScope(this);
      const requestPayload: {
        sourceUserId: string;
        sourceWorkspaceId?: string;
        workspaceId?: string;
      } = { sourceUserId };
      if (sourceWorkspaceId) {
        requestPayload.sourceWorkspaceId = sourceWorkspaceId;
      }
      if (activeScope.scopeType === "workspace" && activeScope.workspaceId) {
        requestPayload.workspaceId = activeScope.workspaceId;
      }
      const requestUrl = `${baseUrl}/ops/sync/import-user`;
      const response = await fetchWithRetry(requestUrl, {
        method: "POST",
        headers: buildAuthenticatedHeaders("session-preferred", {
          "Content-Type": "application/json"
        }, requestUrl),
        body: JSON.stringify(requestPayload)
      });

      if (response.status === 401) {
        handleExpiredAuth(this);
        this.notify("Your sign-in expired. Please sign in again.", "warning");
        return;
      }

      let responsePayload: { error?: string; version?: number; snapshot?: object | null } | null = null;
      try {
        responsePayload = (await response.json()) as { error?: string; version?: number; snapshot?: object | null };
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

      const applyImportedSnapshot = (snapshot: ReturnType<typeof parseCloudSnapshot>): void => {
        const storedVersion = Number(localStorage.getItem(getScopedSyncClientVersionKey(activeScope)));
        const authoritativeSnapshot = Number.isFinite(storedVersion) && storedVersion > snapshot.version
          ? { ...snapshot, version: Math.floor(storedVersion) }
          : snapshot;
        applyCloudSnapshotToLocal(this, authoritativeSnapshot);
      };

      clearScopedSyncDataStorage(activeScope);
      let importedSnapshot: ReturnType<typeof parseCloudSnapshot> | null = null;
      if (responsePayload?.snapshot) {
        importedSnapshot = parseCloudSnapshot(responsePayload.snapshot);
        applyImportedSnapshot(importedSnapshot);
      }
      await this.pullCloudSync(true);
      if (importedSnapshot) {
        // The import response is the explicit admin overwrite; a stale follow-up pull must not win.
        applyImportedSnapshot(importedSnapshot);
      }
      this.notify(`Imported cloud sync data from user ${sourceUserId}.`, "success");
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
  } satisfies ConfigIoMethodImplementation;

