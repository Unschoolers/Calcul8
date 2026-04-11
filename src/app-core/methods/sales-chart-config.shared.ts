import type { LotPerformanceSummary } from "../../types/app.ts";

export const PORTFOLIO_BREAKDOWN_COLORS = [
  "#D7A300",
  "#B8890A",
  "#8A6A1F",
  "#6B6F2A",
  "#6E5A1A",
  "#7C5E2B",
  "#5B6E52",
  "#7A6A55"
];

export type FormatCurrency = (value: number, decimals?: number) => string;
export type FormatDate = (value: string) => string;
export type PortfolioPerformanceRow = LotPerformanceSummary & {
  lotId: number;
  lotName: string;
};

export function buildCategoryTicks(compactMode: boolean | undefined) {
  return compactMode
    ? {
      autoSkip: true,
      maxTicksLimit: 4,
      maxRotation: 0,
      minRotation: 0,
      font: { size: 10 }
    }
    : {
      autoSkip: true,
      maxRotation: 0
    };
}

export function buildBottomLegendOptions(compactMode: boolean | undefined) {
  return {
    position: "bottom" as const,
    labels: {
      padding: compactMode ? 8 : 14,
      font: { size: compactMode ? 10 : 12 },
      boxWidth: compactMode ? 9 : 14
    }
  };
}

export function buildCurrencyTickCallback(
  formatCurrency: FormatCurrency,
  options: {
    prefix?: string;
    suffix?: string;
    decimals?: number;
  } = {}
) {
  return (value: string | number) => {
    const prefix = options.prefix ?? "";
    const suffix = options.suffix ?? "";
    const decimals = options.decimals ?? 0;
    return `${prefix}${formatCurrency(Number(value), decimals)}${suffix}`;
  };
}