import "./ConfigWindow.css";
import AdminSyncImportCard from "./AdminSyncImportCard.vue";
import { useConfigWindowPorts } from "./configWindowPorts.ts";

export const ConfigWindow = {
  name: "ConfigWindow",
  components: {
    AdminSyncImportCard
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
  setup() {
    return useConfigWindowPorts();
  }
};
