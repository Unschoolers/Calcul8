import type {
  ChartConfiguration,
  TooltipItem
} from "chart.js";
import {
  calculateNetFromGross,
  calculatePortfolioSellThroughTimeline,
  calculateSparklineData,
  getGrossRevenueForSale
} from "../../domain/calculations.ts";
import type { Lot, LotPerformanceSummary, LotType, Sale } from "../../types/app.ts";
import { getTodayDate, inferDateFromLotId, toDateOnly } from "./config-shared.ts";

const PORTFOLIO_CHART_COLORS = [
  "#34C759",
  "#5AC8FA",
  "#FFB800",
  "#AF52DE",
  "#FF9500",
  "#00C7BE",
  "#FF3B30",
  "#30B0C7"
];

const PORTFOLIO_BREAKDOWN_COLORS = [
  "#D7A300",
  "#B8890A",
  "#8A6A1F",
  "#6B6F2A",
  "#6E5A1A",
  "#7C5E2B",
  "#5B6E52",
  "#7A6A55"
];

type FormatCurrency = (value: number, decimals?: number) => string;
type FormatDate = (value: string) => string;
type PortfolioPerformanceRow = LotPerformanceSummary & {
  lotId: number;
  lotName: string;
};

function buildLinearTrend(values: number[]): number[] {
  if (values.length <= 1) return [...values];
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    const xDelta = index - xMean;
    numerator += xDelta * (values[index] - yMean);
    denominator += xDelta * xDelta;
  }

  const slope = denominator > 0 ? numerator / denominator : 0;
  const intercept = yMean - (slope * xMean);
  return values.map((_, index) => intercept + (slope * index));
}

function interpolatePortfolioTrendColor(value: number, minValue: number): string {
  if (value >= 0) return "hsl(142 63% 48%)";
  const negativeFloor = Math.min(minValue, -1);
  const normalized = Math.max(0, Math.min(1, 1 - (Math.abs(value) / Math.abs(negativeFloor))));
  const hue = 6 + (normalized * 42);
  return `hsl(${hue.toFixed(0)} 85% 56%)`;
}

function buildPortfolioTrendPointColors(values: number[]): string[] {
  const minValue = values.reduce((min, value) => Math.min(min, value), 0);
  return values.map((value) => interpolatePortfolioTrendColor(value, minValue));
}

function buildPortfolioDateAxis(
  labels: string[],
  compactMode: boolean | undefined,
  opts: { offset?: boolean } = {}
) {
  void labels;
  return {
    type: "category" as const,
    offset: Boolean(opts.offset),
    grid: { display: false },
    ticks: compactMode
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
      }
  };
}

function buildSellThroughDateAxis(
  compactMode: boolean | undefined
) {
  return {
    type: "category" as const,
    offset: true,
    grid: { display: false },
    ticks: compactMode
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
      }
  };
}

function getEarliestSaleDate(sales: Sale[]): string | null {
  let earliest: string | null = null;
  for (const sale of sales) {
    const dateKey = toDateOnly(sale.date);
    if (!dateKey) continue;
    if (!earliest || dateKey < earliest) {
      earliest = dateKey;
    }
  }
  return earliest;
}

export function buildSalesTrendChartConfig(params: {
  sales: Sale[];
  totalCaseCost: number;
  sellingTaxPercent: number;
  formatCurrency: FormatCurrency;
  formatDate: FormatDate;
  formatCompactDate: FormatDate;
}): ChartConfiguration<"line", number[], string> | null {
  if (params.sales.length === 0) return null;

  const sortedSales = [...params.sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const data = calculateSparklineData(params.sales, params.totalCaseCost, params.sellingTaxPercent);
  const fullLabels = ["", ...sortedSales.map((sale) => params.formatDate(sale.date))];
  const compactLabels = ["", ...sortedSales.map((sale) => params.formatCompactDate(sale.date))];
  const finalValue = data[data.length - 1] ?? 0;
  const lineColor = finalValue > 0 ? "#34C759" : "#FF3B30";
  const fillColor = finalValue > 0 ? "rgba(52, 199, 89, 0.16)" : "rgba(255, 59, 48, 0.16)";
  const pointRadius = data.map((_, index) => (index === 0 ? 0 : 3));
  const pointHoverRadius = data.map((_, index) => (index === 0 ? 0 : 5));
  const pointHitRadius = data.map((_, index) => (index === 0 ? 0 : 10));

  return {
    type: "line",
    data: {
      labels: compactLabels,
      datasets: [
        {
          data,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 3,
          pointRadius,
          pointHoverRadius,
          pointHitRadius,
          pointBackgroundColor: lineColor,
          pointBorderColor: "#171717",
          pointBorderWidth: 1.5,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 2,
          bottom: 2,
          left: 2,
          right: 2
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items: Array<{ dataIndex?: number }>) {
              const index = Number(items?.[0]?.dataIndex ?? 0);
              return fullLabels[index] || fullLabels[1] || "Sale";
            },
            label: (context) => `Progress: $${params.formatCurrency(Number(context.parsed?.y || 0))}`
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 5,
            maxRotation: 0
          }
        },
        y: {
          display: true,
          grid: { display: true, color: "rgba(255,255,255,0.08)" },
          ticks: {
            callback: (value) => `$${params.formatCurrency(Number(value), 0)}`
          }
        }
      }
    }
  };
}

export function buildSalesPieChartConfig(params: {
  soldPacks: number;
  totalPacks: number;
  currentLotType: LotType;
  soldNet: number;
  unsoldNet: number;
  formatCurrency: FormatCurrency;
  compactMode?: boolean;
}): ChartConfiguration<"pie", number[], string> {
  const unsoldPacks = Math.max(0, params.totalPacks - params.soldPacks);
  const isSinglesLot = params.currentLotType === "singles";
  const labels = isSinglesLot
    ? [
      `Sold items: ${params.soldPacks}`,
      `Remaining items: ${unsoldPacks}`
    ]
    : [
      `Sold (Net): $${params.formatCurrency(params.soldNet)} | ${params.soldPacks} items`,
      `Unsold (Net est.): $${params.formatCurrency(params.unsoldNet)} | ${unsoldPacks} items`
    ];
  const data = isSinglesLot
    ? [Math.max(0, params.soldPacks), Math.max(0, unsoldPacks)]
    : [Math.max(0, params.soldNet), Math.max(0, params.unsoldNet)];
  const colors = [
    PORTFOLIO_BREAKDOWN_COLORS[0],
    PORTFOLIO_BREAKDOWN_COLORS[2]
  ];

  return {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: "rgba(247, 181, 0, 0.9)",
          borderWidth: 1
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
          position: "bottom",
          labels: {
            padding: params.compactMode ? 8 : 14,
            font: { size: params.compactMode ? 10 : 12 },
            boxWidth: params.compactMode ? 9 : 14
          }
        },
        tooltip: {
          callbacks: {
            label(context: { label?: string }) {
              return context.label;
            }
          }
        }
      }
    }
  };
}

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
          position: params.compactLegend ? "bottom" : "bottom",
          labels: {
            padding: params.compactLegend ? 8 : 14,
            font: { size: params.compactLegend ? 10 : 12 },
            boxWidth: params.compactLegend ? 9 : 14
          }
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
      maintainAspectRatio: true,
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
            callback: (value) => `${params.formatCurrency(Number(value), 0)}%`,
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

export function buildPortfolioHistoryChartConfig(params: {
  portfolioChartView: "trend" | "sellthrough";
  filteredLots: Lot[];
  allLotPerformance: PortfolioPerformanceRow[];
  salesByLotId: Map<number, Sale[]>;
  formatCurrency: FormatCurrency;
  formatDate: FormatDate;
  formatCompactDate?: FormatDate;
  compactMode?: boolean;
  todayDate?: string;
}): ChartConfiguration<"line", number[], string> | ChartConfiguration<"bar", number[], string> | null {
  const lotById = new Map(params.filteredLots.map((lot) => [lot.id, lot]));
  const performanceByLotId = new Map(params.allLotPerformance.map((row) => [row.lotId, row]));
  const labels: string[] = [];
  const values: number[] = [];
  const todayDate = params.todayDate ?? getTodayDate();
  const formatLabel = params.compactMode && typeof params.formatCompactDate === "function"
    ? params.formatCompactDate
    : params.formatDate;

  const netByDate = new Map<string, number>();
  const costByDate = new Map<string, number>();
  const soldByDate = new Map<string, number>();

  for (const lot of params.filteredLots) {
    const sales = params.salesByLotId.get(lot.id) ?? [];
    const performance = performanceByLotId.get(lot.id);
    if (!performance) continue;

    const lotCreatedDate =
      toDateOnly(lot.purchaseDate) ??
      toDateOnly(lot.createdAt) ??
      inferDateFromLotId(lot.id) ??
      getEarliestSaleDate(sales) ??
      todayDate;
    costByDate.set(lotCreatedDate, (costByDate.get(lotCreatedDate) ?? 0) - performance.totalCost);

    for (const sale of sales) {
      const lotFromMap = lotById.get(lot.id);
      if (!lotFromMap) continue;
      const saleDate = toDateOnly(sale.date);
      if (!saleDate) continue;
      const grossRevenue = getGrossRevenueForSale(sale);
      const netRevenue = calculateNetFromGross(
        grossRevenue,
        lotFromMap.sellingTaxPercent,
        sale.buyerShipping || 0,
        1
      );
      netByDate.set(saleDate, (netByDate.get(saleDate) ?? 0) + netRevenue);
      const soldUnits = Math.max(0, Number(sale.packsCount) || 0);
      if (soldUnits > 0) {
        soldByDate.set(saleDate, (soldByDate.get(saleDate) ?? 0) + soldUnits);
      }
    }
  }

  const sortedDates = [...new Set([...costByDate.keys(), ...netByDate.keys(), ...soldByDate.keys()])].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  if (sortedDates.length === 0) return null;

  if (params.portfolioChartView === "sellthrough") {
    const sellThroughTimeline = calculatePortfolioSellThroughTimeline({
      lots: params.filteredLots,
      allLotPerformance: params.allLotPerformance,
      salesByLotId: params.salesByLotId,
      todayDate
    });
    if (sellThroughTimeline.length === 0) return null;

    for (const point of sellThroughTimeline) {
      labels.push(formatLabel(point.label));
      values.push(point.percentage);
    }

    const trendValues = buildLinearTrend(values);
    const maxValue = [...values, ...trendValues].reduce((max, value) => Math.max(max, value), 0);
    const yMax = Math.max(100, Math.ceil(maxValue / 10) * 10);

    const sellThroughConfig = {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Sell-through %",
            data: values,
            backgroundColor: "rgba(247, 181, 0, 0.35)",
            borderColor: "#F7B500",
            borderWidth: 1.5,
            borderRadius: 4,
            clip: 8,
            categoryPercentage: params.compactMode ? 0.96 : 0.9,
            barPercentage: params.compactMode ? 0.92 : 0.82,
            maxBarThickness: params.compactMode ? 24 : 32
          },
          {
            type: "line",
            label: "Trend",
            data: trendValues,
            borderColor: "rgba(247, 181, 0, 0.9)",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.2,
            fill: false
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        layout: {
          padding: {
            left: params.compactMode ? 4 : 2,
            right: params.compactMode ? 4 : 2
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: TooltipItem<"bar">) => {
                const value = Number(context.parsed?.y || 0);
                if (context.dataset?.label === "Trend") {
                  return `Trend: ${params.formatCurrency(value, 1)}%`;
                }
                return `Sell-through: ${params.formatCurrency(value, 1)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            ...buildSellThroughDateAxis(params.compactMode)
          },
          y: {
            min: 0,
            max: yMax,
            ticks: {
              callback: (value: string | number) => `${params.formatCurrency(Number(value), 0)}%`
            }
          }
        }
      }
    } as unknown as ChartConfiguration<"bar", number[], string>;
    return sellThroughConfig;
  }

  let cumulativeProfit = 0;
  for (const date of sortedDates) {
    cumulativeProfit += (costByDate.get(date) ?? 0) + (netByDate.get(date) ?? 0);
    labels.push(formatLabel(date));
    values.push(cumulativeProfit);
  }

  const targetProfit = params.filteredLots.reduce((sum, lot) => {
    const performance = performanceByLotId.get(lot.id);
    if (!performance) return sum;
    const lotTargetPercent = Math.max(0, Number(lot.targetProfitPercent) || 0);
    return sum + ((performance.totalCost || 0) * (lotTargetPercent / 100));
  }, 0);
  const targetValues = labels.map(() => targetProfit);

  const minValue = values.reduce((min, value) => Math.min(min, value), 0);
  const pointColors = buildPortfolioTrendPointColors(values);
  const fillColor = "rgba(247, 181, 0, 0.10)";
  const pointRadius = params.compactMode ? 2 : 2;
  const pointHoverRadius = params.compactMode ? 6 : 5;
  const pointHitRadius = params.compactMode ? 16 : 12;

  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Actual cumulative P/L",
          data: values,
          borderColor: pointColors[pointColors.length - 1] ?? interpolatePortfolioTrendColor(0, minValue),
          segment: {
            borderColor: (context) => {
              const start = Number(context.p0?.parsed?.y ?? 0);
              const end = Number(context.p1?.parsed?.y ?? 0);
              return interpolatePortfolioTrendColor((start + end) / 2, minValue);
            }
          },
          backgroundColor: fillColor,
          borderWidth: 3,
          pointRadius,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointHoverRadius,
          pointHitRadius,
          tension: 0.25,
          fill: true
        },
        {
          label: "Target P/L",
          data: targetValues,
          borderColor: "#F7B500",
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [7, 5],
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
          fill: false
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: params.compactMode ? "bottom" : "top",
          labels: {
            boxWidth: params.compactMode ? 10 : 14,
            font: params.compactMode ? { size: 10 } : undefined,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"line">) => {
              const datasetLabel = String(context.dataset?.label || "Value");
              return `${datasetLabel}: $${params.formatCurrency(Number(context.parsed?.y || 0))}`;
            }
          }
        }
      },
      scales: {
        x: {
          ...buildPortfolioDateAxis(labels, params.compactMode, { offset: false })
        },
        y: {
          ticks: {
            callback: (value) => `$${params.formatCurrency(Number(value), 0)}`
          }
        }
      }
    }
  };
}

