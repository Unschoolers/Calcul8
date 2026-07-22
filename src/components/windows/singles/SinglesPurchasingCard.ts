import { type PropType } from "vue";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import AppToolbarCard from "../../ui/AppToolbarCard.vue";
import type { SinglesWindowThis } from "./SinglesConfigWindow.definition.ts";

export const SinglesPurchasingCard = {
  name: "SinglesPurchasingCard",
  components: {
    AppActionButton,
    AppEmptyState,
    AppMetricValue,
    AppSectionCard,
    AppToolbarCard
  },
  props: {
    ctx: {
      type: Object as PropType<SinglesWindowThis>,
      required: true
    }
  },
  setup(props: { ctx: SinglesWindowThis }) {
    return props.ctx;
  }
};
