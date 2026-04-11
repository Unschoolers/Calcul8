import type { ChartConfiguration } from "chart.js";
import { calculateSparklineData } from "../../domain/calculations.ts";
import type { LotType, Sale } from "../../types/app.ts";
import {
  buildBottomLegendOptions,
  type FormatCurrency,
  type FormatDate,
  PORTFOLIO_BREAKDOWN_COLORS
} from "./sales-chart-config.shared.ts";

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