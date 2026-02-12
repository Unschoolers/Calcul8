import type { Sale, SaleType, UiColor } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

export const uiMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
  | "toggleChartView"
  | "calculateSaleProfit"
  | "getSaleColor"
  | "getSaleIcon"
  | "formatDate"
> = {
  toggleTheme(): void {
    this.$vuetify.theme.global.name = this.isDark ? "unionArenaLight" : "unionArenaDark";
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

  calculateSaleProfit(sale: Sale): number {
    const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
    const netRevenue = this.netFromGross(grossRevenue, sale.buyerShipping || 0, 1);
    const costPerPack = this.totalPacks > 0 ? (this.totalCaseCost / this.totalPacks) : 0;
    const allocatedCost = (sale.packsCount || 0) * costPerPack;
    return netRevenue - allocatedCost;
  },

  getSaleColor(type: SaleType): string {
    if (type === "pack") return "primary";
    if (type === "box") return "secondary";
    return "success";
  },

  getSaleIcon(type: SaleType): string {
    if (type === "pack") return "mdi-package";
    if (type === "box") return "mdi-cube-outline";
    return "mdi-cards-playing-outline";
  },

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
};
