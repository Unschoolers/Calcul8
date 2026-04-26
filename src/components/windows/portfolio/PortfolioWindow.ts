import "./PortfolioWindow.css";
import PortfolioKpiCard from "./PortfolioKpiCard.vue";
import { portfolioWindowDefinition } from "./PortfolioWindow.definition.ts";

export const PortfolioWindow = {
  ...portfolioWindowDefinition,
  components: {
    PortfolioKpiCard
  }
};
