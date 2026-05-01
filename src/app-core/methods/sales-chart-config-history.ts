import type {
  ChartConfiguration,
  TooltipItem
} from "chart.js";
import {
  calculatePortfolioSellThroughTimeline,
  calculateSaleNetRevenue,
} from "../../domain/calculations.ts";
import { resolveLotBusinessDate } from "../../shared/lot-dates.ts";
import type {
  Lot,
  Sale
} from "../../types/app.ts";
import { getTodayDate, toDateOnly } from "./config-shared.ts";
import {
  buildCategoryTicks,
  buildCurrencyTickCallback,
  type FormatCurrency,
  type FormatDate,
  type PortfolioPerformanceRow
} from "./sales-chart-config.shared.ts";

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
  compactMode: boolean | undefined,
  opts: { offset?: boolean } = {}
) {
  return {
    type: "category" as const,
    offset: Boolean(opts.offset),
    grid: { display: false },
    ticks: buildCategoryTicks(compactMode)
  };
}

function buildSellThroughDateAxis(compactMode: boolean | undefined) {
  return {
    type: "category" as const,
    offset: true,
    grid: { display: false },
    ticks: buildCategoryTicks(compactMode)
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
      resolveLotBusinessDate({
        purchaseDate: lot.purchaseDate,
        createdAt: lot.createdAt,
        lotId: lot.id
      }) ??
      getEarliestSaleDate(sales) ??
      todayDate;
    costByDate.set(lotCreatedDate, (costByDate.get(lotCreatedDate) ?? 0) - performance.totalCost);

    for (const sale of sales) {
      const lotFromMap = lotById.get(lot.id);
      if (!lotFromMap) continue;
      const saleDate = toDateOnly(sale.date);
      if (!saleDate) continue;
      const netRevenue = calculateSaleNetRevenue(sale, lotFromMap.sellingTaxPercent, lotFromMap);
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
              callback: buildCurrencyTickCallback(params.formatCurrency, { suffix: "%", decimals: 0 })
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
          fill: false,
          hidden : true
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
          ...buildPortfolioDateAxis(params.compactMode, { offset: false })
        },
        y: {
          ticks: {
            callback: buildCurrencyTickCallback(params.formatCurrency, { prefix: "$", decimals: 0 })
          }
        }
      }
    }
  };
}