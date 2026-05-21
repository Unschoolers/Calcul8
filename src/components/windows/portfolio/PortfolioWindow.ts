import "./PortfolioWindow.css";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import AppToolbarCard from "../../ui/AppToolbarCard.vue";
import PortfolioKpiCard from "./PortfolioKpiCard.vue";
import { portfolioWindowDefinition } from "./PortfolioWindow.definition.ts";

export const PortfolioWindow = {
  ...portfolioWindowDefinition,
  components: {
    AppEmptyState,
    AppSectionCard,
    AppToolbarCard,
    PortfolioKpiCard
  }
};
