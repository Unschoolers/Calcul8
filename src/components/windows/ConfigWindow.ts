import template from "./ConfigWindow.html?raw";
import "./ConfigWindow.css";
import type { PropType } from "vue";

export const ConfigWindow = {
  name: "ConfigWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  methods: {
    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    return props.ctx;
  },
  template
};
