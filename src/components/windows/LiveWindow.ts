import "./LiveWindow.css";
import { LivePriceCard } from "../LivePriceCard.ts";
import LiveSinglesPanel from "./live/LiveSinglesPanel.vue";
import { liveWindowDefinition } from "./LiveWindow.definition.ts";

export const LiveWindow = {
  ...liveWindowDefinition,
  components: {
    LivePriceCard,
    LiveSinglesPanel
  }
};
