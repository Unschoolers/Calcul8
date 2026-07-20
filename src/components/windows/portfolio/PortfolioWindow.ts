import "./PortfolioWindow.css";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import AppToolbarCard from "../../ui/AppToolbarCard.vue";
import BuyerIdentityLabel from "../../customers/BuyerIdentityLabel.vue";
import BuyerQuickViewHost from "../../customers/BuyerQuickViewHost.vue";
import PortfolioPerformanceSheet from "./PortfolioPerformanceSheet.vue";
import PortfolioPulsePanel from "./PortfolioPulsePanel.vue";
import { portfolioWindowDefinition } from "./PortfolioWindow.definition.ts";

export const PortfolioWindow = {
  ...portfolioWindowDefinition,
  components: {
    AppActionButton,
    AppEmptyState,
    AppMetricValue,
    AppSectionCard,
    AppToolbarCard,
    BuyerIdentityLabel,
    BuyerQuickViewHost,
    PortfolioPerformanceSheet,
    PortfolioPulsePanel
  }
};
