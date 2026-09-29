import { APP_VERSION } from "../../constants.ts";
import { formatLocalizedDate } from "../../app-core/i18n/index.ts";
import { useShellPorts } from "./shellPorts.ts";
import MobileLotSwitcher from "./MobileLotSwitcher.vue";
import "./AppShellTopBar.css";

export const AppShellTopBar = {
  name: "AppShellTopBar",
  components: { MobileLotSwitcher },
  setup() {
    const shellPorts = useShellPorts();
    const formatShopifySyncDateTime = (date: string) => formatLocalizedDate(date, shellPorts.preferredLanguage, {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
    });
    const exposedPorts = Object.defineProperties(
      { appVersion: APP_VERSION, formatShopifySyncDateTime },
      Object.getOwnPropertyDescriptors(shellPorts)
    );

    return exposedPorts as typeof shellPorts & { appVersion: string; formatShopifySyncDateTime: typeof formatShopifySyncDateTime };
  }
};
