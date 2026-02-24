import template from "./SalesWindow.html?raw";
import "./SalesWindow.css";
import { inject, type PropType } from "vue";
import type { Sale, SinglesPurchaseEntry } from "../../types/app.ts";
import { createWindowContextBridge } from "./contextBridge.ts";

export const SalesWindow = {
  name: "SalesWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  methods: {
    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      const fn = (this as Record<string, unknown>).formatCurrency;
      if (typeof fn === "function") {
        return (fn as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    },

    isUnlinkedSinglesSale(sale: Sale): boolean {
      const lotType = (this as Record<string, unknown>).currentLotType;
      if (lotType !== "singles") return false;

      const rawId = Number(sale?.singlesPurchaseEntryId);
      if (!Number.isFinite(rawId) || rawId <= 0) return true;

      const entryId = Math.floor(rawId);
      const entries = ((this as Record<string, unknown>).singlesPurchases || []) as SinglesPurchaseEntry[];
      return !entries.some((entry) => Number(entry.id) === entryId);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
