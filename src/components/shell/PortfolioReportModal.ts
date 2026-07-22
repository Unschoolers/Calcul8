import AppActionButton from "../ui/AppActionButton.vue";
import AppMetricValue from "../ui/AppMetricValue.vue";
import AppStickyActionFooter from "../ui/AppStickyActionFooter.vue";
import { useCommerceDialogPorts } from "../modals/commerceDialogPorts.ts";
import "./PortfolioReportModal.css";

export const PortfolioReportModal = {
  name: "PortfolioReportModal",
  components: {
    AppActionButton,
    AppMetricValue,
    AppStickyActionFooter
  },
  setup() {
    return useCommerceDialogPorts();
  }
};
