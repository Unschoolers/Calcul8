import { inject, type PropType } from "vue";
import AppStickyActionFooter from "../ui/AppStickyActionFooter.vue";
import { createWindowContextBridge } from "../windows/shared/contextBridge.ts";
import "./SaleEditorModal.css";

export const SaleEditorModal = {
  name: "SaleEditorModal",
  components: {
    AppStickyActionFooter
  },
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
