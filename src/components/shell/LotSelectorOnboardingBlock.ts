import { AppErrorState } from "../ui/AppErrorState.ts";
import { useShellPorts } from "./shellPorts.ts";
import "./LotSelectorOnboardingBlock.css";

export const LotSelectorOnboardingBlock = {
  name: "LotSelectorOnboardingBlock",
  components: {
    AppErrorState
  },
  setup() {
    return useShellPorts();
  }
};
