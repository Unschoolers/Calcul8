import { inject, type PropType } from "vue";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import AppToolbarCard from "../../ui/AppToolbarCard.vue";
import { createWindowContextBridge } from "../shared/contextBridge.ts";

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
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (props.ctx ?? injectedCtx ?? {}) as Record<string, unknown>;
    return createWindowContextBridge(source);
  }
};
