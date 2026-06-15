import "./SalesWindow.css";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppKpiGrid from "../../ui/AppKpiGrid.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import { SalesWindowDefinition } from "./SalesWindow.definition.ts";

export const SalesWindow = {
  ...SalesWindowDefinition,
  components: {
    AppActionButton,
    AppEmptyState,
    AppKpiGrid,
    AppMetricValue,
    AppSectionCard
  }
};
