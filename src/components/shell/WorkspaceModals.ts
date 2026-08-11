import AppConfirmDialog from "../ui/AppConfirmDialog.vue";
import AppDialogShell from "../ui/AppDialogShell.vue";
import AppDestructiveWarning from "../ui/AppDestructiveWarning.vue";
import AppEmptyState from "../ui/AppEmptyState.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import "./WorkspaceModals.css";

export const WorkspaceModals = {
  name: "WorkspaceModals",
  components: {
    AppConfirmDialog,
    AppDialogShell,
    AppDestructiveWarning,
    AppEmptyState,
    AppFormLayout
  },
  setup() {
    return useWorkspaceDialogPorts();
  }
};
