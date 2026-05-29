import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../windows/shared/contextBridge.ts";
import "../windows/config/ConfigWindow.css";

export const SystemConfigurationDialog = {
  name: "SystemConfigurationDialog",
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
  }
};
