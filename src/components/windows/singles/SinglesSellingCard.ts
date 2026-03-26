import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../contextBridge.ts";

export const SinglesSellingCard = {
  name: "SinglesSellingCard",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (props.ctx ?? injectedCtx ?? {}) as Record<string, unknown>;
    return createWindowContextBridge(source);
  }
};
