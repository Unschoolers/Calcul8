import type { Sale, SaleType, UiColor } from "../../../types/app.ts";
import type { AppContext, AppMethodState } from "../../context.ts";
import { calculateSaleProfit as calculateSaleProfitValue } from "../../../domain/calculations.ts";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function formatLocalDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const uiBaseMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
  | "toggleChartView"
  | "togglePortfolioChartView"
  | "calculateSaleProfit"
  | "getSaleColor"
  | "getSaleIcon"
  | "formatDate"
> = {
  toggleTheme(): void {
    this.$vuetify.theme.change(this.isDark ? "unionArenaLight" : "unionArenaDark");
  },

  notify(message: string, color: UiColor = "info"): void {
    this.snackbar.text = message;
    this.snackbar.color = color;
    this.snackbar.show = true;
  },

  askConfirmation(
    { title, text, color = "error" }: { title: string; text: string; color?: UiColor },
    action: () => void
  ): void {
    this.confirmTitle = title;
    this.confirmText = text;
    this.confirmColor = color;
    this.confirmAction = action;
    this.confirmDialog = true;
  },

  runConfirmAction(): void {
    if (typeof this.confirmAction === "function") {
      this.confirmAction();
    }
    this.confirmDialog = false;
    this.confirmAction = null;
  },

  cancelConfirmAction(): void {
    this.confirmDialog = false;
    this.confirmAction = null;
  },

  formatCurrency(value: number | null | undefined, decimals = 2): string {
    if (value == null || isNaN(value)) return "0.00";
    return Number(value).toFixed(decimals);
  },

  safeFixed(value: number, decimals = 2): string {
    return this.formatCurrency(value, decimals);
  },

  toggleChartView(): void {
    this.chartView = this.chartView === "pie" ? "sparkline" : "pie";
  },

  togglePortfolioChartView(): void {
    this.portfolioChartView = this.portfolioChartView === "breakdown"
      ? "trend"
      : this.portfolioChartView === "trend"
        ? "sellthrough"
        : "breakdown";
  },

  calculateSaleProfit(sale: Sale): number {
    return calculateSaleProfitValue({
      sale,
      lotType: this.currentLotType,
      sellingTaxPercent: this.sellingTaxPercent,
      totalCaseCost: this.totalCaseCost,
      totalPacks: this.totalPacks,
      purchaseCurrency: this.currency,
      sellingCurrency: this.sellingCurrency,
      exchangeRate: this.exchangeRate,
      singlesPurchases: this.singlesPurchases
    });
  },

  getSaleColor(type: SaleType): string {
    if (type === "pack") return "primary";
    if (type === "box") return "secondary";
    return "success";
  },

  getSaleIcon(type: SaleType): string {
    if (type === "pack") return "mdi-tag-outline";
    if (type === "box") return "mdi-cube-outline";
    return "mdi-cards-playing-outline";
  },

  formatDate(dateStr: string): string {
    if (!dateStr) return "";

    // Keep date-only values in local time to avoid UTC day shift (e.g. 2026-02-21 showing as Feb 20).
    if (DATE_ONLY_REGEX.test(dateStr)) {
      const [year, month, day] = dateStr.split("-").map((part) => Number(part));
      const localDate = new Date(year, month - 1, day);
      if (!Number.isNaN(localDate.getTime())) {
        return formatLocalDate(localDate);
      }
    }

    const slashMatch = dateStr.match(SLASH_DATE_REGEX);
    if (slashMatch) {
      const month = Number(slashMatch[1]);
      const day = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);
      const localDate = new Date(year, month - 1, day);
      if (!Number.isNaN(localDate.getTime())) {
        return formatLocalDate(localDate);
      }
    }

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return dateStr;
    }
    return formatLocalDate(date);
  }
};
