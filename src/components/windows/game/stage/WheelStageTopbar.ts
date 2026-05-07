import { inject, type PropType } from "vue";
import { createNestedWindowContextBridge } from "../../shared/contextBridge.ts";

export const WheelStageTopbar = {
  name: "WheelStageTopbar",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedGameCtx = inject<Record<string, unknown> | null>("gameCtx", null);
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedGameCtx ?? injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};

