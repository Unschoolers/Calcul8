import AppActionButton from "../../ui/AppActionButton.vue";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import AppToolbarCard from "../../ui/AppToolbarCard.vue";
import { useSinglesPurchasingPorts } from "./singlesConfigPorts.ts";

export const SinglesPurchasingCard = {
  name: "SinglesPurchasingCard",
  components: {
    AppActionButton,
    AppEmptyState,
    AppMetricValue,
    AppSectionCard,
    AppToolbarCard
  },
  setup() {
    return useSinglesPurchasingPorts();
  }
};
