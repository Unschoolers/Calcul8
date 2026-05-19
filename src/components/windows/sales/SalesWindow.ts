import "./SalesWindow.css";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import { SalesWindowDefinition } from "./SalesWindow.definition.ts";

export const SalesWindow = {
  ...SalesWindowDefinition,
  components: {
    AppEmptyState,
    AppSectionCard
  }
};
