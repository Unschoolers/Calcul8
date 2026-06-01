import "./PortfolioWindow.css";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import AppToolbarCard from "../../ui/AppToolbarCard.vue";
import PortfolioPulsePanel from "./PortfolioPulsePanel.vue";
import { portfolioWindowDefinition } from "./PortfolioWindow.definition.ts";

export const PortfolioWindow = {
  ...portfolioWindowDefinition,
  components: {
    AppEmptyState,
    AppSectionCard,
    AppToolbarCard,
    PortfolioPulsePanel
  }
};
