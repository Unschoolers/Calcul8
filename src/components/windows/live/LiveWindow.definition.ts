import { useLiveWindowPorts } from "./liveWindowPorts.ts";

export const liveWindowDefinition = {
  name: "LiveWindow",
  methods: {
    getLiveSinglesPanelVm(this: any): Record<string, unknown> | null {
      const refs = this?.$refs as Record<string, unknown> | undefined;
      const panel = refs?.liveSinglesPanel;
      if (!panel || typeof panel !== "object") return null;
      return panel as Record<string, unknown>;
    },
    applySinglesAutoPricing(this: any): void {
      const panel = this.getLiveSinglesPanelVm();
      const fn = panel?.panelApplySuggestedLiveSinglesPricing;
      if (typeof fn === "function") {
        (fn as () => void).call(panel);
      }
    },
    resetSinglesPricing(this: any): void {
      const panel = this.getLiveSinglesPanelVm();
      const fn = panel?.panelResetLiveSinglesPricing;
      if (typeof fn === "function") {
        (fn as () => void).call(panel);
      }
    },
    profitForLive(units: number, pricePerUnit: number): number {
      const fn = (this as Record<string, unknown>).calculateProfit;
      if (typeof fn === "function") {
        return (fn as (u: number, p: number) => number)(units, pricePerUnit);
      }
      return 0;
    },
    getLiveForecastScenario(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): Record<string, unknown> | null {
      const scenarios = Array.isArray(this.liveForecastScenarios) ? this.liveForecastScenarios : [];
      const found = scenarios.find((scenario) => {
        const scenarioId = (scenario as { id?: unknown })?.id;
        return scenarioId === id;
      });
      return (found as Record<string, unknown> | undefined) ?? null;
    },
    liveScenarioProfit(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number | null {
      const getScenario = this.getLiveForecastScenario as
        | ((scenarioId: "item" | "box" | "rtyh") => Record<string, unknown> | null)
        | undefined;
      if (typeof getScenario !== "function") return null;
      const scenario = getScenario.call(this, id);
      if (!scenario) return null;
      const value = Number(scenario.forecastProfit);
      return Number.isFinite(value) ? value : null;
    },
    liveScenarioPercent(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number | null {
      const getScenario = this.getLiveForecastScenario as
        | ((scenarioId: "item" | "box" | "rtyh") => Record<string, unknown> | null)
        | undefined;
      if (typeof getScenario !== "function") return null;
      const scenario = getScenario.call(this, id);
      if (!scenario) return null;
      const value = Number(scenario.forecastMarginPercent);
      return Number.isFinite(value) ? value : null;
    },
    liveScenarioProfitAtPrice(this: Record<string, unknown>, id: "item" | "box" | "rtyh", unitPrice: number): number | null {
      const remainingUnits = liveWindowDefinition.methods.getRemainingUnitsForMode.call(this as never, id);
      if (remainingUnits <= 0) return null;

      const netFromGross = this.netFromGross as
        | ((grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number) => number)
        | undefined;
      if (typeof netFromGross !== "function") return null;

      const normalizedUnitPrice = Number(unitPrice);
      if (!Number.isFinite(normalizedUnitPrice)) return null;

      const totalRevenue = Math.max(0, Number(this.totalRevenue) || 0);
      const totalCost = Math.max(0, Number(this.totalCaseCost) || 0);
      const shippingPerOrder = Math.max(0, Number(this.sellingShippingPerOrder) || 0);
      const grossRemaining = remainingUnits * normalizedUnitPrice;
      const netRemaining = netFromGross(grossRemaining, shippingPerOrder, remainingUnits);
      const forecastRevenue = totalRevenue + netRemaining;
      return forecastRevenue - totalCost;
    },
    liveScenarioPercentAtPrice(this: Record<string, unknown>, id: "item" | "box" | "rtyh", unitPrice: number): number | null {
      const profit = liveWindowDefinition.methods.liveScenarioProfitAtPrice.call(this as never, id, unitPrice);
      if (profit == null) return null;
      const totalCost = Math.max(0, Number(this.totalCaseCost) || 0);
      if (totalCost <= 0) return null;
      return (profit / totalCost) * 100;
    },
    getNeededPriceForMode(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number | null {
      const value = id === "item"
        ? this.requiredPackPriceFromNow
        : id === "box"
          ? this.requiredBoxPriceFromNow
          : this.requiredSpotPriceFromNow;
      if (value == null) return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    getRemainingUnitsForMode(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number {
      const raw = id === "item"
        ? this.remainingPacksCount
        : id === "box"
          ? this.remainingBoxesEquivalent
          : this.remainingSpotsEquivalent;
      return Math.max(0, Number(raw) || 0);
    },
    liveScenarioProfitAtNeeded(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number | null {
      const getNeededPrice = this.getNeededPriceForMode as
        | ((scenarioId: "item" | "box" | "rtyh") => number | null)
        | undefined;
      if (typeof getNeededPrice !== "function") return null;
      const neededPrice = getNeededPrice.call(this, id);
      if (neededPrice == null) return null;
      return liveWindowDefinition.methods.liveScenarioProfitAtPrice.call(this as never, id, neededPrice);
    },
    liveScenarioPercentAtNeeded(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number | null {
      const getNeededPrice = this.getNeededPriceForMode as
        | ((scenarioId: "item" | "box" | "rtyh") => number | null)
        | undefined;
      if (typeof getNeededPrice !== "function") return null;
      const neededPrice = getNeededPrice.call(this, id);
      if (neededPrice == null) return null;
      return liveWindowDefinition.methods.liveScenarioPercentAtPrice.call(this as never, id, neededPrice);
    },
    safeFixedForLive(value: number, decimals = 2): string {
      const formatCurrency = (this as Record<string, unknown>).formatCurrency;
      if (typeof formatCurrency === "function") {
        return (formatCurrency as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      const fn = (this as Record<string, unknown>).safeFixed;
      if (typeof fn === "function") {
        return (fn as (v: number, d?: number) => string)(value, decimals);
      }
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value == null || Number.isNaN(Number(value)) ? 0 : Number(value));
    }
  },
  setup() {
    return useLiveWindowPorts();
  }
};
