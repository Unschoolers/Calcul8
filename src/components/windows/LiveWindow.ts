import template from "./LiveWindow.html?raw";
import "./LiveWindow.css";
import { LivePriceCard } from "../LivePriceCard.ts";
import { LiveSinglesPanel } from "./live/LiveSinglesPanel.ts";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "./contextBridge.ts";

export const LiveWindow = {
  name: "LiveWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  components: {
    LivePriceCard,
    LiveSinglesPanel
  },
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
      const getRemainingUnits = this.getRemainingUnitsForMode as
        | ((scenarioId: "item" | "box" | "rtyh") => number)
        | undefined;
      if (typeof getRemainingUnits !== "function") return null;
      const remainingUnits = getRemainingUnits.call(this, id);
      if (remainingUnits <= 0) return null;
      const netFromGross = this.netFromGross as
        | ((grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number) => number)
        | undefined;
      if (typeof netFromGross !== "function") return null;
      const totalRevenue = Math.max(0, Number(this.totalRevenue) || 0);
      const totalCost = Math.max(0, Number(this.totalCaseCost) || 0);
      const shippingPerOrder = Math.max(0, Number(this.sellingShippingPerOrder) || 0);
      const grossRemaining = remainingUnits * neededPrice;
      const netRemaining = netFromGross(grossRemaining, shippingPerOrder, remainingUnits);
      const forecastRevenue = totalRevenue + netRemaining;
      return forecastRevenue - totalCost;
    },
    liveScenarioPercentAtNeeded(this: Record<string, unknown>, id: "item" | "box" | "rtyh"): number | null {
      const computeProfit = this.liveScenarioProfitAtNeeded as
        | ((scenarioId: "item" | "box" | "rtyh") => number | null)
        | undefined;
      if (typeof computeProfit !== "function") return null;
      const profit = computeProfit.call(this, id);
      if (profit == null) return null;
      const totalCost = Math.max(0, Number(this.totalCaseCost) || 0);
      if (totalCost <= 0) return null;
      return (profit / totalCost) * 100;
    },
    safeFixedForLive(value: number, decimals = 2): string {
      const fn = (this as Record<string, unknown>).safeFixed;
      if (typeof fn === "function") {
        return (fn as (v: number, d?: number) => string)(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
