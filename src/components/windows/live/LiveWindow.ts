import "./LiveWindow.css";
import { LivePriceCard } from "../../live-price/LivePriceCard.ts";
import ContextActionDock from "../../shell/ContextActionDock.vue";
import LiveSinglesPanel from "./LiveSinglesPanel.vue";
import { liveWindowDefinition } from "./LiveWindow.definition.ts";

export const LiveWindow = {
  ...liveWindowDefinition,
  components: {
    LivePriceCard,
    LiveSinglesPanel,
    ContextActionDock
  }
};
