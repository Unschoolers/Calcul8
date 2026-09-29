import AppDialogShell from "../../ui/AppDialogShell.vue";
import { useShellPorts } from "../../shell/shellPorts.ts";

export const ShopifyConnectDialog = {
  name: "ShopifyConnectDialog",
  components: { AppDialogShell },
  setup() { return useShellPorts(); }
};
