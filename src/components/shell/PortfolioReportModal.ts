import AppActionButton from "../ui/AppActionButton.vue";
import AppDialogShell from "../ui/AppDialogShell.vue";
import AppMetricValue from "../ui/AppMetricValue.vue";
import { useCommerceDialogPorts } from "../modals/commerceDialogPorts.ts";
import "./PortfolioReportModal.css";

export const PortfolioReportModal = {
  name: "PortfolioReportModal",
  components: {
    AppActionButton,
    AppDialogShell,
    AppMetricValue
  },
  setup() {
    return useCommerceDialogPorts();
  }
};
