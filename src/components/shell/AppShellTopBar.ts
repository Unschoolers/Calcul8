import { APP_VERSION } from "../../constants.ts";
import { useShellPorts } from "./shellPorts.ts";
import MobileLotSwitcher from "./MobileLotSwitcher.vue";
import "./AppShellTopBar.css";

export const AppShellTopBar = {
  name: "AppShellTopBar",
  components: { MobileLotSwitcher },
  setup() {
    return {
      ...useShellPorts(),
      appVersion: APP_VERSION
    };
  }
};
