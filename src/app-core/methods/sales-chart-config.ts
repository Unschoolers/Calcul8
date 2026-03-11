import type { ChartConfiguration } from "chart.js";
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

type FormatCurrency = (value: number, decimals?: number) => string;
type FormatDate = (value: string) => string;
type PortfolioPerformanceRow = LotPerformanceSummary & {
  lotId: number;
  lotName: string;
};

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
}): ChartConfiguration<"line", number[], string> | null {
  if (params.sales.length === 0) return null;

  const sortedSales = [...params.sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const data = calculateSparklineData(params.sales, params.totalCaseCost, params.sellingTaxPercent);
  const labels = ["Start", ...sortedSales.map((sale) => params.formatDate(sale.date))];
  const finalValue = data[data.length - 1] ?? 0;
  const lineColor = finalValue > 0 ? "#34C759" : "#FF3B30";
  const fillColor = finalValue > 0 ? "rgba(52, 199, 89, 0.16)" : "rgba(255, 59, 48, 0.16)";

  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 3,
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
              return labels[index] ?? "Sale";
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
}): ChartConfiguration<"doughnut", number[], string> {
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

  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: ["#34C759", "#FF3B30"],
          borderWidth: 0
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 15,
            font: { size: 12 }
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
}): ChartConfiguration<"doughnut", number[], string> | null {
  const rows = params.rows.filter((row) => row.totalRevenue > 0);
  if (rows.length === 0) return null;

  const labels = rows.map((row) => row.lotName);
  const data = rows.map((row) => row.totalRevenue);
  const colors = rows.map((_, index) => PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]);

  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 0
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
          position: params.compactLegend ? "right" : "bottom",
          labels: {
            padding: params.compactLegend ? 10 : 14,
            font: { size: params.compactLegend ? 11 : 12 },
            boxWidth: params.compactLegend ? 10 : 14
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
    .filter((row) => row.salesCount > 0 && Number.isFinite(Number(row.realizedMarginPercent)))
    .map((row) => ({
      ...row,
      realizedMarginPercent: Number(row.realizedMarginPercent)
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
          backgroundColor: rows.map((row) => row.realizedMarginPercent >= 0 ? "rgba(52, 199, 89, 0.75)" : "rgba(255, 59, 48, 0.75)"),
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
      labels.push(formatLabel(point.date));
      values.push(point.percentage);
    }

    const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
    const yMax = Math.max(100, Math.ceil(maxValue / 10) * 10);

    return {
      type: "bar",
      data: {
        labels,
        datasets: [
            {
              label: "Sell-through %",
              data: values,
              backgroundColor: "rgba(247, 181, 0, 0.35)",
              borderColor: "#F7B500",
              borderWidth: 1.5,
              borderRadius: 4,
              clip: false,
              categoryPercentage: params.compactMode ? 0.96 : 0.9,
              barPercentage: params.compactMode ? 0.92 : 0.82,
              maxBarThickness: params.compactMode ? 24 : 32
            }
          ]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          layout: {
            padding: {
              left: params.compactMode ? 6 : 4,
              right: params.compactMode ? 10 : 8
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
            callbacks: {
              label: (context) => `Sell-through: ${params.formatCurrency(Number(context.parsed?.y || 0), 1)}%`
            }
          }
        },
        scales: {
          x: {
            ...buildPortfolioDateAxis(labels, params.compactMode, { offset: false })
            },
          y: {
            min: 0,
            max: yMax,
            ticks: {
              callback: (value) => `${params.formatCurrency(Number(value), 0)}%`
            }
          }
        }
      }
    };
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

  const finalProfit = values[values.length - 1] ?? 0;
  const lineColor = finalProfit >= 0 ? "#34C759" : "#FF3B30";
  const fillColor = finalProfit >= 0 ? "rgba(52, 199, 89, 0.18)" : "rgba(255, 59, 48, 0.18)";
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
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 3,
          pointRadius,
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
            label: (context) => {
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

