import "./ConfigWindow.css";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../shared/contextBridge.ts";
import AdminSyncImportCard from "./AdminSyncImportCard.vue";

export const ConfigWindow = {
  name: "ConfigWindow",
  components: {
    AdminSyncImportCard
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  methods: {
    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      const formatter = (this as unknown as { formatCurrency?: (nextValue: number | null | undefined, nextDecimals?: number) => string }).formatCurrency;
      if (typeof formatter === "function") {
        return formatter.call(this, value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(0);
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(Number(value));
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  }
};
