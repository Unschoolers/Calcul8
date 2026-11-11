import type { ChartConfiguration } from "chart.js";
import { translateAppMessage } from "../i18n/index.ts";
import type {
  PortfolioSalesByUserChartData,
  PortfolioSalesByUserMetric
} from "../../types/app.ts";
import {
  buildAdaptiveCurrencyTickCallback,
  buildBottomLegendOptions,
  buildCategoryTicks,
  type FormatCurrency,
  type PortfolioPerformanceRow,
  PORTFOLIO_BREAKDOWN_COLORS
} from "./sales-chart-config.shared.ts";

export function buildPortfolioBreakdownChartConfig(params: {
  rows: PortfolioPerformanceRow[];
  compactLegend: boolean;
  formatCurrency: FormatCurrency;
}): ChartConfiguration<"pie", number[], string> | null {
  const rows = params.rows.filter((row) => row.totalRevenue > 0);
  if (rows.length === 0) return null;

  const labels = rows.map((row) => row.lotName);
  const data = rows.map((row) => row.totalRevenue);
  const colors = rows.map((_, index) => PORTFOLIO_BREAKDOWN_COLORS[index % PORTFOLIO_BREAKDOWN_COLORS.length]);

  return {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: "rgba(247, 181, 0, 0.9)",
          borderWidth: 1,
          hoverBorderWidth: 1.5
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          ...buildBottomLegendOptions(params.compactLegend)
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const row = rows[context.dataIndex ?? 0];
              if (!row) return String(context.label ?? "");
              return `${row.lotName}: $${params.formatCurrency(row.totalRevenue)} CAD`;
            }
          }
        }
      }
    }
  };
}

function roundUpMarginTickStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const fraction = value / magnitude;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}

export function buildPortfolioMarginChartConfig(params: {
  rows: PortfolioPerformanceRow[];
  compactMode: boolean;
  formatCurrency: FormatCurrency;
  preferredLanguage?: string;
}): ChartConfiguration<"bar", number[], string> | null {
  const t = (key: string) => translateAppMessage(params.preferredLanguage || "", key);
  const rows = params.rows
    .filter((row) => row.salesCount > 0 || row.totalPacks > 0)
    .map((row) => ({
      ...row,
      realizedMarginPercent: row.salesCount > 0 && Number.isFinite(Number(row.realizedMarginPercent))
        ? Number(row.realizedMarginPercent)
        : 0
    }))
    .sort((a, b) => b.realizedMarginPercent - a.realizedMarginPercent);
  if (rows.length === 0) return null;

  const largestGain = Math.max(0, rows[0]!.realizedMarginPercent);
  const largestLoss = Math.max(0, -rows[rows.length - 1]!.realizedMarginPercent);
  const gainStep = roundUpMarginTickStep(largestGain / 3);
  const gainMaximum = largestGain > 0 ? Math.min(Number.MAX_VALUE, Math.ceil(largestGain / gainStep) * gainStep) : largestLoss > 0 ? 0 : 1;
  const lossStep = roundUpMarginTickStep(largestLoss / 3);
  const lossMaximum = Math.min(Number.MAX_VALUE, Math.ceil(largestLoss / lossStep) * lossStep);
  const lossScale = 20;
  const naturalLossExtent = lossScale * Math.log1p(lossMaximum / lossScale);
  // Bound the rounded loss axis, not just its bars, to at most a quarter of a mixed plot.
  const lossCompression = largestGain > 0 && naturalLossExtent > 0
    ? Math.min(1, gainMaximum / 3 / naturalLossExtent)
    : 1;
  const compressLoss = (margin: number) => margin < 0
    ? -lossScale * Math.log1p(-margin / lossScale) * lossCompression
    : margin;
  // Choose readable actual percentages first; evenly spaced log coordinates produce ticks like -224%.
  const tickMargins = lossMaximum > 0 ? [-lossMaximum] : [];
  if (largestGain === 0 && lossMaximum > 1) {
    const middleLoss = roundUpMarginTickStep(lossScale * Math.expm1(naturalLossExtent / lossScale / 2));
    if (middleLoss < lossMaximum) tickMargins.push(-middleLoss);
  }
  for (let value = 0; value <= gainMaximum; value += gainStep) tickMargins.push(value);
  const tickLabels = new Map(tickMargins.map((margin) => [compressLoss(margin), `${params.formatCurrency(margin, 0)}%`]));
  const plottedMargins = rows.map((row) => compressLoss(row.realizedMarginPercent));
  return {
    type: "bar",
    data: {
      labels: rows.map((row) => row.lotName),
      datasets: [
        {
          label: t("portfolioChartMarginDatasetLabel"),
          data: plottedMargins,
          backgroundColor: "rgba(247, 181, 0, 0.35)",
          borderColor: "#F7B500",
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: params.compactMode ? 18 : 24
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const row = rows[context.dataIndex ?? 0];
              if (!row) return String(context.formattedValue ?? "");
              const marginValue = `${params.formatCurrency(row.realizedMarginPercent, 1)}%`;
              if (row.salesCount <= 0) {
                return `${row.lotName}: ${t("portfolioChartMarginTooltipLabel")} ${marginValue} (${t("portfolioChartMarginNoSalesLabel")})`;
              }
              return `${row.lotName}: ${t("portfolioChartMarginTooltipLabel")} ${marginValue}`;
            }
          }
        }
      },
      scales: {
        x: {
          min: lossMaximum > 0 ? compressLoss(-lossMaximum) : 0,
          max: gainMaximum,
          afterBuildTicks: (axis) => {
            axis.ticks = tickMargins.map((margin) => ({ value: compressLoss(margin) }));
          },
          ticks: {
            callback: (value) => tickLabels.get(Number(value)),
            autoSkip: false,
            maxRotation: 0,
            font: params.compactMode ? { size: 10 } : undefined
          },
          grid: {
            color: "rgba(255, 255, 255, 0.08)"
          }
        },
        y: {
          ticks: {
            autoSkip: false,
            font: params.compactMode ? { size: 10 } : undefined
          },
          grid: {
            display: false
          }
        }
      }
    }
  };
}

export function buildPortfolioSalesByUserChartConfig(params: {
  chartData: PortfolioSalesByUserChartData;
  metric: PortfolioSalesByUserMetric;
  compactMode: boolean;
  formatCurrency: FormatCurrency;
  preferredLanguage?: string;
}): ChartConfiguration<"line", number[], string> | null {
  if (!Array.isArray(params.chartData?.series) || params.chartData.series.length === 0) return null;

  const t = (key: string) => translateAppMessage(params.preferredLanguage || "", key);
  const metricLabel = params.metric === "profit"
    ? t("portfolioSalesByUserChartMetricProfitLabel")
    : params.metric === "count"
      ? t("portfolioSalesByUserChartMetricCountLabel")
      : t("portfolioSalesByUserChartMetricRevenueLabel");

  return {
    type: "line",
    data: {
      labels: params.chartData.weeks.map((week) => week.label),
      datasets: params.chartData.series.map((series, index) => ({
        label: series.label,
        data: series.values,
        stack: "portfolio-sales-by-user",
        backgroundColor: `${series.color}2E`,
        borderColor: series.color,
        borderWidth: params.compactMode ? 2 : 2.4,
        pointRadius: params.compactMode ? 2 : 2.5,
        pointHoverRadius: params.compactMode ? 4 : 5,
        pointHitRadius: params.compactMode ? 10 : 12,
        pointBackgroundColor: series.color,
        pointBorderColor: "#171717",
        pointBorderWidth: 1.25,
        tension: 0,
        fill: index === 0 ? "origin" : "-1"
      }))
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false,
          ...buildBottomLegendOptions(params.compactMode)
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed?.y || 0);
              if (params.metric === "count") {
                const countLabel = value === 1 ? t("portfolioSalesCountLabel") : t("portfolioSalesPluralCountLabel");
                return `${context.dataset.label}: ${params.formatCurrency(value, 0)} ${countLabel}`;
              }
              return `${context.dataset.label}: $${params.formatCurrency(value)} CAD`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: buildCategoryTicks(params.compactMode)
        },
        y: {
          stacked: true,
          ticks: {
            callback: params.metric === "profit"
              ? buildAdaptiveCurrencyTickCallback(params.formatCurrency, { prefix: "$", suffix: " CAD" })
              : (value) => {
                const numericValue = Number(value);
                if (params.metric === "count") {
                  return params.formatCurrency(numericValue, 0);
                }
                return `$${params.formatCurrency(numericValue, 0)} CAD`;
              }
          },
          title: {
            display: !params.compactMode,
            text: params.metric === "count" ? metricLabel : `${metricLabel} (CAD)`
          }
        }
      }
    }
  };
}
