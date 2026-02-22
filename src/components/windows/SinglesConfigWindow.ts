import template from "./SinglesConfigWindow.html?raw";
import "./ConfigWindow.css";
import "./SinglesConfigWindow.css";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "./contextBridge.ts";

export const SinglesConfigWindow = {
  name: "SinglesConfigWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
