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

export function buildAdaptiveCurrencyTickCallback(
  formatCurrency: FormatCurrency,
  options: { prefix?: string; suffix?: string } = {}
) {
  return (value: string | number, index = 0, ticks: Array<{ value: string | number }> = []) => {
    const adjacentValues = [ticks[index - 1], ticks[index + 1]]
      .filter((tick): tick is { value: string | number } => Boolean(tick))
      .map((tick) => Math.abs(Number(tick.value) - Number(value)))
      .filter((difference) => Number.isFinite(difference) && difference > 0);
    const step = adjacentValues.length > 0 ? Math.min(...adjacentValues) : 1;
    const decimals = Math.min(2, Math.max(0, Math.ceil(-Math.log10(step) - 1e-10)));
    const roundedValue = Number(Number(value).toFixed(decimals));
    const formattedValue = roundedValue === 0
      ? formatCurrency(0, 0)
      : formatCurrency(roundedValue, decimals);
    return `${options.prefix ?? ""}${formattedValue}${options.suffix ?? ""}`;
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