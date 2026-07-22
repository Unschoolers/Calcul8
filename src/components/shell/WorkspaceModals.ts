import AppConfirmDialog from "../ui/AppConfirmDialog.vue";
import AppDestructiveWarning from "../ui/AppDestructiveWarning.vue";
import AppEmptyState from "../ui/AppEmptyState.vue";
import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import "./WorkspaceModals.css";

export const WorkspaceModals = {
  name: "WorkspaceModals",
  components: {
    AppConfirmDialog,
    AppDestructiveWarning,
    AppEmptyState
  },
  setup() {
    return useWorkspaceDialogPorts();
  }
};
