import AppDialogShell from "../ui/AppDialogShell.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import "./SystemConfigurationDialog.css";

export const SystemConfigurationDialog = {
  name: "SystemConfigurationDialog",
  components: {
    AppDialogShell,
    AppFormLayout
  },
  setup() {
    return useWorkspaceDialogPorts();
  }
};
