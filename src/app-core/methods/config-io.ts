import type { Lot } from "../../types/app.ts";
import type { AppContext } from "../context.ts";
import { type ConfigMethodSubset, type ImportableLot, getTodayDate, inferDateFromLotId, toDateOnly } from "./config-shared.ts";

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
    "Lot\tSales\tSold Packs\tTotal Packs\tRevenue\tCost\tProfit\tMargin %\tLast Sale"
  ];

  for (const row of context.allLotPerformance) {
    lines.push(
      [
        sanitizeTsvCell(row.lotName),
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
  | "exportLots"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "importLots"
  | "handleFileImport"
> = {
  exportLots(): void {
    if (this.lots.length === 0) {
      this.notify("No lots to export", "warning");
      return;
    }

    const bundle = {
      version: 2,
      exportedAt: new Date().toISOString(),
      lastLotId: this.currentLotId ?? null,
      lots: this.lots.map((p) => ({
        ...p,
        sales: this.loadSalesForLotId(p.id)
      }))
    };

    const dataStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rtyh-bundle-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.notify("Lots exported", "success");
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
  },

  importLots(): void {
    this.$refs.fileInput?.click();
  },

  handleFileImport(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const raw = e.target?.result;
        if (typeof raw !== "string") {
          this.notify("Invalid file format. Please upload a valid JSON file.", "error");
          return;
        }
        const imported = JSON.parse(raw) as unknown;

        let importedLots: ImportableLot[] = [];
        let lastLotId: number | null = null;

        if (Array.isArray(imported)) {
          importedLots = imported as ImportableLot[];
        } else if (imported && typeof imported === "object") {
          const payload = imported as {
            lots?: ImportableLot[];
            presets?: ImportableLot[];
            lastLotId?: number | null;
            lastPresetId?: number | null;
          };
          if (Array.isArray(payload.lots)) {
            importedLots = payload.lots;
          } else if (Array.isArray(payload.presets)) {
            importedLots = payload.presets;
          } else {
            this.notify("Invalid file format. Please upload a valid JSON file.", "error");
            return;
          }
          lastLotId = payload.lastLotId ?? payload.lastPresetId ?? null;
        } else {
          this.notify("Invalid file format. Please upload a valid JSON file.", "error");
          return;
        }

        if (importedLots.length === 0) {
          this.notify("No valid lots found in file", "warning");
          return;
        }

        const todayDate = getTodayDate();
        const cleanedLots: Lot[] = importedLots.map((p) => {
          const { sales, ...rest } = p;
          return {
            ...rest,
            lotType: (rest as Lot).lotType === "singles" ? "singles" : "bulk",
            purchaseDate:
              toDateOnly((rest as Lot).purchaseDate) ??
              toDateOnly((rest as Lot).createdAt) ??
              inferDateFromLotId((rest as Lot).id) ??
              todayDate,
            createdAt:
              toDateOnly((rest as Lot).createdAt) ??
              toDateOnly((rest as Lot).purchaseDate) ??
              inferDateFromLotId((rest as Lot).id) ??
              todayDate
          };
        });

        this.lots = cleanedLots;
        this.saveLotsToStorage();

        importedLots.forEach((p) => {
          if (p && p.id != null && Array.isArray(p.sales)) {
            localStorage.setItem(this.getSalesStorageKey(p.id), JSON.stringify(p.sales));
          }
        });

        const candidateId =
          (lastLotId && this.lots.some((p) => p.id === lastLotId))
            ? lastLotId
            : this.lots[0].id;

        this.currentLotId = candidateId;
        this.loadLot();
        this.notify(`Imported ${this.lots.length} lot(s)`, "success");
      } catch (error) {
        console.error("Import error:", error);
        this.notify("Invalid file format. Please upload a valid JSON file.", "error");
      } finally {
        if (target) target.value = "";
      }
    };

    reader.onerror = () => {
      this.notify("Error reading file", "error");
      if (target) target.value = "";
    };

    reader.readAsText(file);
  }
};
