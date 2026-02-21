import template from "./AutoCalculateModal.html?raw";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../windows/contextBridge.ts";

export const AutoCalculateModal = {
  name: "AutoCalculateModal",
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
