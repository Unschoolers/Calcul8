import template from "./ConfigWindow.html?raw";
import "./ConfigWindow.css";
import { createWindowContextBridge } from "./bridge.ts";

export const ConfigWindow = {
  name: "ConfigWindow",
  methods: {
    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    }
  },
  setup() {
    return createWindowContextBridge();
  },
  template
};
