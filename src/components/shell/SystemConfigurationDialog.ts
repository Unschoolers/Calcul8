import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import "./SystemConfigurationDialog.css";

export const SystemConfigurationDialog = {
  name: "SystemConfigurationDialog",
  setup() {
    return useWorkspaceDialogPorts();
  }
};
