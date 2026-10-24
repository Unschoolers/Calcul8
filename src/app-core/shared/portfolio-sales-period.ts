import type { PortfolioSalesByUserPeriod } from "../../types/app.ts";

export const PORTFOLIO_SALES_BY_USER_PERIODS = [4, 8, 13, 26, 52, "all"] as const;
export const DEFAULT_PORTFOLIO_SALES_BY_USER_PERIOD: PortfolioSalesByUserPeriod = 8;

export function normalizePortfolioSalesByUserPeriod(value: unknown): PortfolioSalesByUserPeriod {
  return PORTFOLIO_SALES_BY_USER_PERIODS.some((period) => period === value)
    ? value as PortfolioSalesByUserPeriod
    : DEFAULT_PORTFOLIO_SALES_BY_USER_PERIOD;
}
