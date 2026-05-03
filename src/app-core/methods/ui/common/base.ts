import { calculateSaleProfit as calculateSaleProfitValue, getSaleProfitPreview as getSaleProfitPreviewValue } from "../../../../domain/calculations.ts";
import type { Sale, SaleType, UiColor } from "../../../../types/app.ts";
import type { AppContext, AppMethodState } from "../../../context-app.ts";
import { STORAGE_KEYS } from "../../../storageKeys.ts";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  normalizeLanguagePreference,
  translateAppMessage
} from "../../../i18n/index.ts";

export const uiBaseMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "t"
  | "setPreferredLanguage"
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
  | "toggleChartView"
  | "togglePortfolioChartView"
  | "togglePortfolioReportLot"
  | "accessProFeature"
  | "requestPurchaseUiMode"
  | "calculateSaleProfit"
  | "getSaleProfitPreview"
  | "getSaleColor"
  | "getSaleIcon"
  | "formatDate"
> = {
  t(key, params) {
    return translateAppMessage(this.preferredLanguage, key, params);
  },

  setPreferredLanguage(language: string): void {
    this.preferredLanguage = normalizeLanguagePreference(language);
  },

  toggleTheme(): void {
    const nextTheme = this.isDark ? "unionArenaLight" : "unionArenaDark";
    this.$vuetify.theme.change(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, nextTheme);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }
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
    return formatLocalizedNumber(value, this.preferredLanguage, decimals);
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
        : this.portfolioChartView === "sellthrough"
          ? "margin"
          : "breakdown";
  },

  togglePortfolioReportLot(lotId: number): void {
    this.portfolioReportExpandedLotIds = this.portfolioReportExpandedLotIds.includes(lotId)
      ? this.portfolioReportExpandedLotIds.filter((id) => id !== lotId)
      : [...this.portfolioReportExpandedLotIds, lotId];
  },

  async accessProFeature(target): Promise<void> {
    if (!this.hasProAccess) {
      await this.startProPurchase();
      return;
    }

    if (target === "autoCalculate") {
      this.showProfitCalculator = true;
      return;
    }

    if (target === "portfolioReport") {
      this.openPortfolioReportModal();
      return;
    }

    if (target === "salesTracking") {
      this.speedDialOpenSales = true;
      return;
    }

    this.purchaseUiMode = "expert";
  },

  async requestPurchaseUiMode(mode): Promise<void> {
    if (mode === "simple" || this.hasProAccess) {
      this.purchaseUiMode = mode;
      return;
    }
    await this.accessProFeature("expertMode");
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
      singlesPurchases: this.singlesPurchases,
      feeProfileInput: this
    });
  },

  getSaleProfitPreview(sale: Sale) {
    return getSaleProfitPreviewValue({
      sale,
      lotType: this.currentLotType,
      sellingTaxPercent: this.sellingTaxPercent,
      totalCaseCost: this.totalCaseCost,
      totalPacks: this.totalPacks,
      purchaseCurrency: this.currency,
      sellingCurrency: this.sellingCurrency,
      exchangeRate: this.exchangeRate,
      singlesPurchases: this.singlesPurchases,
      feeProfileInput: this
    });
  },

  getSaleColor(type: SaleType): string {
    if (type === "pack") return "primary";
    if (type === "box") return "secondary";
    if (type === "wheel") return "warning";
    return "success";
  },

  getSaleIcon(type: SaleType): string {
    if (type === "pack") return "mdi-tag-outline";
    if (type === "box") return "mdi-cube-outline";
    if (type === "wheel") return "mdi-tire";
    return "mdi-cards-playing-outline";
  },

  formatDate(dateStr: string): string {
    return formatLocalizedDate(dateStr, this.preferredLanguage);
  }
};

