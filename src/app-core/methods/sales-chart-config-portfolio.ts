import type { ChartConfiguration } from "chart.js";
import type {
  PortfolioSalesByUserChartData,
  PortfolioSalesByUserMetric
} from "../../types/app.ts";
import {
  buildBottomLegendOptions,
  buildCategoryTicks,
  buildCurrencyTickCallback,
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
              return `${row.lotName}: $${params.formatCurrency(row.totalRevenue)}`;
            }
          }
        }
      }
    }
  };
}

export function buildPortfolioMarginChartConfig(params: {
  rows: PortfolioPerformanceRow[];
  compactMode: boolean;
  formatCurrency: FormatCurrency;
}): ChartConfiguration<"bar", number[], string> | null {
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

  return {
    type: "bar",
    data: {
      labels: rows.map((row) => row.lotName),
      datasets: [
        {
          label: "Sold profit margin %",
          data: rows.map((row) => row.realizedMarginPercent),
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
                return `${row.lotName}: Sold margin ${marginValue} (no sales yet)`;
              }
              return `${row.lotName}: Sold margin ${marginValue}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            callback: buildCurrencyTickCallback(params.formatCurrency, { suffix: "%", decimals: 0 }),
            font: params.compactMode ? { size: 10 } : undefined
          },
          grid: {
            color: "rgba(255, 255, 255, 0.08)"
          }
        },
        y: {
          ticks: {
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
}): ChartConfiguration<"line", number[], string> | null {
  if (!Array.isArray(params.chartData?.series) || params.chartData.series.length === 0) return null;

  const metricLabel = params.metric === "profit"
    ? "Realized profit"
    : params.metric === "count"
      ? "Sales count"
      : "Revenue";

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
                return `${context.dataset.label}: ${params.formatCurrency(value, 0)} sale${value === 1 ? "" : "s"}`;
              }
              return `${context.dataset.label}: $${params.formatCurrency(value)}`;
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
            callback: (value) => {
              const numericValue = Number(value);
              if (params.metric === "count") {
                return params.formatCurrency(numericValue, 0);
              }
              return `$${params.formatCurrency(numericValue, 0)}`;
            }
          },
          title: {
            display: !params.compactMode,
            text: metricLabel
          }
        }
      }
    }
  };
}
