import { APP_VERSION } from "../../constants.ts";
import { useShellPorts } from "./shellPorts.ts";
import MobileLotSwitcher from "./MobileLotSwitcher.vue";
import "./AppShellTopBar.css";

export const AppShellTopBar = {
  name: "AppShellTopBar",
  components: { MobileLotSwitcher },
  setup() {
    const shellPorts = useShellPorts();
    const exposedPorts = Object.defineProperties(
      { appVersion: APP_VERSION },
      Object.getOwnPropertyDescriptors(shellPorts)
    );

    return exposedPorts as typeof shellPorts & { appVersion: string };
  }
};
