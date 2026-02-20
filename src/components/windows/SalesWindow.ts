import template from "./SalesWindow.html?raw";
import "./SalesWindow.css";
import type { PropType } from "vue";

export const SalesWindow = {
  name: "SalesWindow",
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
