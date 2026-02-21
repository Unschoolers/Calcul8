import template from "./LiveWindow.html?raw";
import "./LiveWindow.css";
import { LivePriceCard } from "../LivePriceCard.ts";
import { inject, type PropType } from "vue";
import { createWindowContextBridge, resolveWindowContext } from "./contextBridge.ts";

export const LiveWindow = {
  name: "LiveWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  components: {
    LivePriceCard
  },
  methods: {
    profitForLive(units: number, pricePerUnit: number): number {
      const fn = (this as Record<string, unknown>).calculateProfit;
      if (typeof fn === "function") {
        return (fn as (u: number, p: number) => number)(units, pricePerUnit);
      }
      return 0;
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
    return createWindowContextBridge(resolveWindowContext(source));
  },
  template
};
