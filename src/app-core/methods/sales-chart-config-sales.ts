import type { ChartConfiguration } from "chart.js";
import {
  calculateSaleNetRevenue,
  calculateSparklineData
} from "../../domain/calculations.ts";
import type { LotType, Sale } from "../../types/app.ts";
import {
  buildBottomLegendOptions,
  type FormatCurrency,
  type FormatDate,
  PORTFOLIO_BREAKDOWN_COLORS
} from "./sales-chart-config.shared.ts";

function sortSalesByDateAsc(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function buildSalesLineChartConfig(params: {
  values: number[];
  sortedSales: Sale[];
  label: string;
  tooltipLabel: string;
  formatCurrency: FormatCurrency;
  formatDate: FormatDate;
  formatCompactDate: FormatDate;
}): ChartConfiguration<"line", number[], string> {
  const fullLabels = ["", ...params.sortedSales.map((sale) => params.formatDate(sale.date))];
  const compactLabels = ["", ...params.sortedSales.map((sale) => params.formatCompactDate(sale.date))];
  const finalValue = params.values[params.values.length - 1] ?? 0;
  const lineColor = finalValue >= 0 ? "#34C759" : "#FF3B30";
  const fillColor = finalValue >= 0 ? "rgba(52, 199, 89, 0.16)" : "rgba(255, 59, 48, 0.16)";
  const pointRadius = params.values.map((_, index) => (index === 0 ? 0 : 3));
  const pointHoverRadius = params.values.map((_, index) => (index === 0 ? 0 : 5));
  const pointHitRadius = params.values.map((_, index) => (index === 0 ? 0 : 10));

  return {
    type: "line",
    data: {
      labels: compactLabels,
      datasets: [
        {
          label: params.label,
          data: params.values,
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
            label: (context) => `${params.tooltipLabel}: $${params.formatCurrency(Number(context.parsed?.y || 0))}`
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

function buildCumulativeProfitData(params: {
  sortedSales: Sale[];
  calculateSaleProfit: (sale: Sale) => number;
}): number[] {
  let cumulativeProfit = 0;
  const values = [0];
  for (const sale of params.sortedSales) {
    cumulativeProfit += Number(params.calculateSaleProfit(sale)) || 0;
    values.push(cumulativeProfit);
  }
  return values;
}

function buildCumulativeRevenueData(params: {
  sortedSales: Sale[];
  sellingTaxPercent: number;
}): number[] {
  let cumulativeRevenue = 0;
  const values = [0];
  for (const sale of params.sortedSales) {
    cumulativeRevenue += calculateSaleNetRevenue(sale, params.sellingTaxPercent);
    values.push(cumulativeRevenue);
  }
  return values;
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

  const sortedSales = sortSalesByDateAsc(params.sales);
  const legacyData = calculateSparklineData(params.sales, params.totalCaseCost, params.sellingTaxPercent);
  const revenueData = buildCumulativeRevenueData({
    sortedSales,
    sellingTaxPercent: params.sellingTaxPercent
  });
  const data = legacyData.length === revenueData.length ? revenueData : legacyData;

  return buildSalesLineChartConfig({
    values: data,
    sortedSales,
    label: "Sales revenue",
    tooltipLabel: "Sales revenue",
    formatCurrency: params.formatCurrency,
    formatDate: params.formatDate,
    formatCompactDate: params.formatCompactDate
  });
}

export function buildSalesProfitTrendChartConfig(params: {
  sales: Sale[];
  calculateSaleProfit: (sale: Sale) => number;
  formatCurrency: FormatCurrency;
  formatDate: FormatDate;
  formatCompactDate: FormatDate;
}): ChartConfiguration<"line", number[], string> | null {
  if (params.sales.length === 0) return null;

  const sortedSales = sortSalesByDateAsc(params.sales);
  return buildSalesLineChartConfig({
    values: buildCumulativeProfitData({
      sortedSales,
      calculateSaleProfit: params.calculateSaleProfit
    }),
    sortedSales,
    label: "Realized profit",
    tooltipLabel: "Realized profit",
    formatCurrency: params.formatCurrency,
    formatDate: params.formatDate,
    formatCompactDate: params.formatCompactDate
  });
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
          ...buildBottomLegendOptions(params.compactMode)
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
