import { AppErrorState } from "../ui/AppErrorState.ts";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useShellPorts } from "./shellPorts.ts";
import "./LotSelectorOnboardingBlock.css";
import ShopifyLinkIndicator from "../windows/shopify/ShopifyLinkIndicator.vue";

export const LotSelectorOnboardingBlock = {
  name: "LotSelectorOnboardingBlock",
  components: {
    AppErrorState,
    AppFormLayout,
    ShopifyLinkIndicator
  },
  setup() {
    return useShellPorts();
  }
};
