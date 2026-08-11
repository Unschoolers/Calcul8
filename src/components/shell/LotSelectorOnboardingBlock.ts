import { AppErrorState } from "../ui/AppErrorState.ts";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useShellPorts } from "./shellPorts.ts";
import "./LotSelectorOnboardingBlock.css";

export const LotSelectorOnboardingBlock = {
  name: "LotSelectorOnboardingBlock",
  components: {
    AppErrorState,
    AppFormLayout
  },
  setup() {
    return useShellPorts();
  }
};
