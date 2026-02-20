import template from "./PortfolioWindow.html?raw";
import "./PortfolioWindow.css";
import type { PropType } from "vue";

export const PortfolioWindow = {
  name: "PortfolioWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    return props.ctx;
  },
  template
};
