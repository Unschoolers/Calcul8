import { inject, type PropType } from "vue";
import AppConfirmDialog from "../ui/AppConfirmDialog.vue";
import AppDestructiveWarning from "../ui/AppDestructiveWarning.vue";
import AppEmptyState from "../ui/AppEmptyState.vue";
import { createWindowContextBridge } from "../windows/shared/contextBridge.ts";
import "./WorkspaceModals.css";

export const WorkspaceModals = {
  name: "WorkspaceModals",
  components: {
    AppConfirmDialog,
    AppDestructiveWarning,
    AppEmptyState
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
