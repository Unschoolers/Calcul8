import Chart from "chart.js/auto";
import { calculateNetFromGross, calculateSparklineData } from "../../domain/calculations.ts";
import type { Sale, SaleType } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";
import { getTodayDate } from "./config-shared.ts";

function firstFiniteNonNegative(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0) {
      return next;
    }
  }
  return null;
}

function resolveDefaultSaleUnitPrice(context: AppContext, type: SaleType): number {
  if (type === "box") {
    return firstFiniteNonNegative(context.liveBoxPriceSell, context.boxPriceSell) ?? 0;
  }
  if (type === "rtyh") {
    return firstFiniteNonNegative(context.liveSpotPrice, context.spotPrice) ?? 0;
  }
  return firstFiniteNonNegative(context.livePackPrice, context.packPrice) ?? 0;
}

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

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (DATE_ONLY_REGEX.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalDate(date);
}

function inferDateFromLotId(lotId: number): string | null {
  const timestamp = Number(lotId);
  if (!Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > 4102444800000) {
    return null;
  }
  return formatLocalDate(new Date(timestamp));
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

function safeDestroyChart(chart: Chart | null): void {
  if (!chart) return;
  try {
    chart.stop();
    chart.destroy();
  } catch {
    // Ignore teardown errors from stale canvas/context during rapid UI toggles.
  }
}

function refreshChartsForCurrentTab(context: AppContext): void {
  const runRefresh = () => {
    if (context.currentTab === "sales") {
      context.initSalesChart();
      return;
    }
    if (context.currentTab === "portfolio") {
      context.initPortfolioChart();
    }
  };

  const scheduleNextTick = (context as Partial<AppContext>).$nextTick;
  if (typeof scheduleNextTick === "function") {
    void scheduleNextTick.call(context, runRefresh);
    return;
  }
  runRefresh();
}

function focusSaleQuantityInput(context: AppContext): void {
  const scheduleNextTick = (context as Partial<AppContext>).$nextTick;
  const runFocus = () => {
    if (!context.$refs) return;
    const refs = context.$refs as {
      saleQuantityInput?:
        | HTMLInputElement
        | { focus?: () => void; $el?: Element | null }
        | null;
    };
    const quantityRef = refs.saleQuantityInput;
    if (!quantityRef) return;

    if (typeof quantityRef.focus === "function") {
      quantityRef.focus();
      return;
    }

    if (typeof quantityRef === "object" && quantityRef !== null && "$el" in quantityRef) {
      const input = quantityRef.$el?.querySelector("input");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }
  };

  if (typeof scheduleNextTick === "function") {
    void scheduleNextTick.call(context, runFocus);
    return;
  }

  runFocus();
}

function resolveCanvasRef(
  context: AppContext,
  windowRefName: "salesWindow" | "portfolioWindow",
  canvasRefName: string
): HTMLCanvasElement | null {
  if (!context.$refs) return null;
  const rootRefs = context.$refs as Record<string, unknown>;

  const direct = rootRefs[canvasRefName];
  if (direct instanceof HTMLCanvasElement) {
    return direct;
  }

  const windowComponent = rootRefs[windowRefName] as { $refs?: Record<string, unknown> } | undefined;
  const nested = windowComponent?.$refs?.[canvasRefName];
  if (nested instanceof HTMLCanvasElement) {
    return nested;
  }

  return null;
}

export const salesMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "loadSalesFromStorage"
  | "saveSalesToStorage"
  | "openAddSaleModal"
  | "onNewSaleTypeChange"
  | "saveSale"
  | "editSale"
  | "deleteSale"
  | "cancelSale"
  | "initSalesChart"
  | "initPortfolioChart"
> = {
  loadSalesFromStorage(): void {
    if (!this.currentLotId) return;

    try {
      this.sales = this.loadSalesForLotId(this.currentLotId);
    } catch (error) {
      console.error("Failed to load sales:", error);
      this.sales = [];
    }
  },

  saveSalesToStorage(): void {
    if (!this.currentLotId) return;

    try {
      const key = this.getSalesStorageKey(this.currentLotId);
      localStorage.setItem(key, JSON.stringify(this.sales));
    } catch (error) {
      console.error("Failed to save sales:", error);
    }
  },

  openAddSaleModal(saleType: SaleType = "pack"): void {
    const nextPrice = resolveDefaultSaleUnitPrice(this, saleType);
    this.editingSale = null;
    this.newSale = {
      type: saleType,
      quantity: null,
      packsCount: null,
      price: nextPrice,
      buyerShipping: Number(this.sellingShippingPerOrder) || 0,
      date: getTodayDate()
    };
    this.showAddSaleModal = true;
    focusSaleQuantityInput(this);
  },

  onNewSaleTypeChange(type: SaleType): void {
    const nextType: SaleType = type === "box" || type === "rtyh" ? type : "pack";
    this.newSale.type = nextType;
    if (this.editingSale) return;
    this.newSale.price = resolveDefaultSaleUnitPrice(this, nextType);
  },

  saveSale(): void {
    if (!this.canUsePaidActions) {
      this.notify("Pro access required to add or update sales", "warning");
      return;
    }

    const quantity = Number(this.newSale.quantity);
    const price = Number(this.newSale.price);
    const buyerShipping = Number(this.newSale.buyerShipping);
    const rtyhPacks = Number(this.newSale.packsCount);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.notify("Please enter a valid quantity greater than 0", "warning");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      this.notify("Please enter a valid price (0 or greater)", "warning");
      return;
    }
    if (!Number.isFinite(buyerShipping) || buyerShipping < 0) {
      this.notify("Please enter a valid buyer shipping amount (0 or greater)", "warning");
      return;
    }

    if (this.newSale.type === "rtyh" && (!Number.isFinite(rtyhPacks) || rtyhPacks <= 0)) {
      this.notify("Please enter the number of packs sold for RTYH", "warning");
      return;
    }

    let packsCount: number;
    if (this.newSale.type === "pack") {
      packsCount = quantity;
    } else if (this.newSale.type === "box") {
      packsCount = quantity * this.packsPerBox;
    } else {
      packsCount = rtyhPacks;
    }

    const normalizedSaleDate = toDateOnly(this.newSale.date) ?? getTodayDate();

    const sale: Sale = {
      id: this.editingSale ? this.editingSale.id : Date.now(),
      type: this.newSale.type,
      quantity,
      packsCount: packsCount || 0,
      price,
      buyerShipping,
      date: normalizedSaleDate
    };

    if (this.editingSale) {
      const index = this.sales.findIndex((s) => s.id === this.editingSale?.id);
      if (index === -1) {
        this.notify("Could not find the sale to update. Please try again.", "error");
        return;
      }
      this.sales.splice(index, 1, sale);
      this.sales = [...this.sales];
    } else {
      this.sales = [...this.sales, sale];
    }

    this.cancelSale();
    refreshChartsForCurrentTab(this);
  },

  editSale(sale: Sale): void {
    this.editingSale = sale;
    this.newSale = {
      type: sale.type,
      quantity: sale.quantity,
      packsCount: sale.type === "rtyh" ? sale.packsCount : null,
      price: sale.price,
      buyerShipping: sale.buyerShipping ?? 0,
      date: toDateOnly(sale.date) ?? getTodayDate()
    };
    this.showAddSaleModal = true;
    focusSaleQuantityInput(this);
  },

  deleteSale(id: number): void {
    this.askConfirmation(
      {
        title: "Delete Sale?",
        text: "This action cannot be undone.",
        color: "error"
      },
      () => {
        this.sales = this.sales.filter((s) => s.id !== id);
        this.notify("Sale deleted", "info");
        refreshChartsForCurrentTab(this);
      }
    );
  },

  cancelSale(): void {
    this.showAddSaleModal = false;
    this.editingSale = null;
    this.newSale = {
      type: "pack",
      quantity: null,
      packsCount: null,
      price: 0,
      buyerShipping: this.sellingShippingPerOrder,
      date: getTodayDate()
    };
  },

  initSalesChart(): void {
    safeDestroyChart(this.salesChart);
    this.salesChart = null;

    const chartCanvas = this.chartView === "pie"
      ? resolveCanvasRef(this, "salesWindow", "salesChart")
      : resolveCanvasRef(this, "salesWindow", "salesTrendChart");
    if (!chartCanvas) return;
    const existingSalesChart = Chart.getChart(chartCanvas);
    if (existingSalesChart) {
      safeDestroyChart(existingSalesChart);
    }

    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;
    if (this.chartView !== "pie") {
      if (this.sales.length === 0) return;

      const sortedSales = [...this.sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const data = calculateSparklineData(this.sales, this.totalCaseCost, this.sellingTaxPercent);
      const labels = ["Start", ...sortedSales.map((sale) => this.formatDate(sale.date))];
      const finalValue = data[data.length - 1] ?? 0;
      const lineColor = finalValue > 0 ? "#34C759" : "#FF3B30";
      const fillColor = finalValue > 0 ? "rgba(52, 199, 89, 0.16)" : "rgba(255, 59, 48, 0.16)";

      this.salesChart = new Chart(ctx, {
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
                label: (context) => `Progress: $${this.formatCurrency(Number(context.parsed?.y || 0))}`
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
                callback: (value) => `$${this.formatCurrency(Number(value), 0)}`
              }
            }
          }
        }
      });
      return;
    }

    const soldPacks = this.soldPacksCount;
    const totalPacks = this.totalPacks;
    const unsoldPacks = Math.max(0, totalPacks - soldPacks);
    const soldNet = this.totalRevenue;

    const grossUnsold = unsoldPacks * (this.packPrice || 0);
    const unsoldNet = this.netFromGross(grossUnsold, this.sellingShippingPerOrder, unsoldPacks);

    this.salesChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: [
          `Sold (Net): $${this.formatCurrency(soldNet)} | ${soldPacks} packs`,
          `Unsold (Net est.): $${this.formatCurrency(unsoldNet)} | ${unsoldPacks} packs`
        ],
        datasets: [
          {
            data: [Math.max(0, soldNet), Math.max(0, unsoldNet)],
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
    });
  },

  initPortfolioChart(): void {
    safeDestroyChart(this.portfolioChart);
    this.portfolioChart = null;

    if (this.currentTab !== "portfolio") return;

    const chartCanvas = resolveCanvasRef(this, "portfolioWindow", "portfolioChart");
    if (!chartCanvas) return;
    const existingPortfolioChart = Chart.getChart(chartCanvas);
    if (existingPortfolioChart) {
      safeDestroyChart(existingPortfolioChart);
    }

    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;

    if (this.portfolioChartView === "breakdown") {
      const rows = this.allLotPerformance.filter((row) => row.totalRevenue > 0);
      if (rows.length === 0) return;

      const labels = rows.map((row) => `${row.lotName} • $${this.formatCurrency(row.totalRevenue)}`);
      const data = rows.map((row) => row.totalRevenue);
      const colors = rows.map((_, index) => PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]);

      this.portfolioChart = new Chart(ctx, {
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
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                padding: 14,
                font: { size: 12 }
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => `${context.label}`
              }
            }
          }
        }
      });
      return;
    }

    const selectedLotIdSet = new Set(this.portfolioSelectedLotIds);
    const filteredLots = this.lots.filter((lot) => selectedLotIdSet.has(lot.id));
    const lotById = new Map(filteredLots.map((lot) => [lot.id, lot]));
    const performanceByLotId = new Map(this.allLotPerformance.map((row) => [row.lotId, row]));
    const salesByLotId = new Map(
      filteredLots.map((lot) => [
        lot.id,
        this.currentLotId === lot.id ? this.sales : this.loadSalesForLotId(lot.id)
      ])
    );
    const labels: string[] = [];
    const values: number[] = [];
    const todayDate = getTodayDate();

    const netByDate = new Map<string, number>();
    const costByDate = new Map<string, number>();

    for (const lot of filteredLots) {
      const sales = salesByLotId.get(lot.id) ?? [];
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
        const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
        const netRevenue = calculateNetFromGross(
          grossRevenue,
          lotFromMap.sellingTaxPercent,
          sale.buyerShipping || 0,
          1
        );
        netByDate.set(saleDate, (netByDate.get(saleDate) ?? 0) + netRevenue);
      }
    }

    const sortedDates = [...new Set([...costByDate.keys(), ...netByDate.keys()])].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    if (sortedDates.length === 0) return;

    let cumulativeProfit = 0;
    for (const date of sortedDates) {
      cumulativeProfit += (costByDate.get(date) ?? 0) + (netByDate.get(date) ?? 0);
      labels.push(this.formatDate(date));
      values.push(cumulativeProfit);
    }

    const finalProfit = values[values.length - 1] ?? 0;
    const lineColor = finalProfit >= 0 ? "#34C759" : "#FF3B30";
    const fillColor = finalProfit >= 0 ? "rgba(52, 199, 89, 0.18)" : "rgba(255, 59, 48, 0.18)";

    this.portfolioChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderColor: lineColor,
            backgroundColor: fillColor,
            borderWidth: 3,
            pointRadius: 2,
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Cumulative P/L: $${this.formatCurrency(Number(context.parsed?.y || 0))}`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: {
              callback: (value) => `$${this.formatCurrency(Number(value), 0)}`
            }
          }
        }
      }
    });
  }
};
