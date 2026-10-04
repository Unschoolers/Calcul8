import { AppErrorState } from "../ui/AppErrorState.ts";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useShellPorts } from "./shellPorts.ts";
import "./LotSelectorOnboardingBlock.css";
import LotThumbnail from "../ui/LotThumbnail.vue";
import ShopifyLinkIndicator from "../windows/shopify/ShopifyLinkIndicator.vue";

export const LotSelectorOnboardingBlock = {
  name: "LotSelectorOnboardingBlock",
  components: {
    AppErrorState,
    AppFormLayout,
    ShopifyLinkIndicator,
    LotThumbnail
  },
  setup() {
    return useShellPorts();
  }
};
