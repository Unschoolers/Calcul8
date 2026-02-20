import template from "./LiveWindow.html?raw";
import "./LiveWindow.css";
import { createWindowContextBridge } from "./bridge.ts";
import { LivePriceCard } from "../LivePriceCard.ts";

export const LiveWindow = {
  name: "LiveWindow",
  components: {
    LivePriceCard
  },
  setup() {
    return createWindowContextBridge();
  },
  template
};
