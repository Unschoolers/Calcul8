import Chart from "chart.js/auto";
import type { Sale } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

export const salesMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "loadSalesFromStorage"
  | "saveSalesToStorage"
  | "saveSale"
  | "editSale"
  | "deleteSale"
  | "cancelSale"
  | "initSalesChart"
> = {
  loadSalesFromStorage(): void {
    if (!this.currentPresetId) return;

    try {
      const key = this.getSalesStorageKey(this.currentPresetId);
      const stored = localStorage.getItem(key);
      if (!stored) {
        this.sales = [];
        return;
      }
      const parsed = JSON.parse(stored) as Array<Sale & { buyerShipping?: number }>;
      this.sales = parsed.map((sale) => ({
        ...sale,
        buyerShipping: Number(sale.buyerShipping) || 0
      }));
    } catch (error) {
      console.error("Failed to load sales:", error);
      this.sales = [];
    }
  },

  saveSalesToStorage(): void {
    if (!this.currentPresetId) return;

    try {
      const key = this.getSalesStorageKey(this.currentPresetId);
      localStorage.setItem(key, JSON.stringify(this.sales));
    } catch (error) {
      console.error("Failed to save sales:", error);
    }
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

    const sale: Sale = {
      id: this.editingSale ? this.editingSale.id : Date.now(),
      type: this.newSale.type,
      quantity,
      packsCount: packsCount || 0,
      price,
      buyerShipping,
      date: this.newSale.date
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
  },

  editSale(sale: Sale): void {
    this.editingSale = sale;
    this.newSale = {
      type: sale.type,
      quantity: sale.quantity,
      packsCount: sale.type === "rtyh" ? sale.packsCount : null,
      price: sale.price,
      buyerShipping: sale.buyerShipping ?? 0,
      date: sale.date
    };
    this.showAddSaleModal = true;
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
      }
    );
  },

  cancelSale(): void {
    this.showAddSaleModal = false;
    this.editingSale = null;
    this.newSale = {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 0,
      buyerShipping: this.sellingShippingPerOrder,
      date: new Date().toISOString().split("T")[0]
    };
  },

  initSalesChart(): void {
    if (this.chartView !== "pie") {
      if (this.salesChart) {
        this.salesChart.destroy();
        this.salesChart = null;
      }
      return;
    }

    const chartCanvas = this.$refs.salesChart;
    if (!chartCanvas) return;

    if (this.salesChart) {
      this.salesChart.destroy();
      this.salesChart = null;
    }

    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;

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
        responsive: true,
        maintainAspectRatio: true,
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
  }
};
