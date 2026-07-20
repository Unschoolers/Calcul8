import "./SalesWindow.css";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppKpiGrid from "../../ui/AppKpiGrid.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import BuyerQuickViewHost from "../../customers/BuyerQuickViewHost.vue";
import SalesHistoryLedger from "./SalesHistoryLedger.vue";
import { SalesWindowDefinition } from "./SalesWindow.definition.ts";

export const SalesWindow = {
  ...SalesWindowDefinition,
  components: {
    AppEmptyState,
    AppKpiGrid,
    AppMetricValue,
    AppSectionCard,
    BuyerQuickViewHost,
    SalesHistoryLedger
  }
};
