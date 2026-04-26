import "./WheelWindow.css";
import WheelActionRail from "./WheelActionRail.vue";
import WheelHistoryPanel from "./WheelHistoryPanel.vue";
import WheelInspector from "./WheelInspector.vue";
import MysteryGridSurface from "./MysteryGridSurface.vue";
import WheelStageSummary from "./WheelStageSummary.vue";
import WheelStageTopbar from "./WheelStageTopbar.vue";
import { wheelWindowDefinition } from "./WheelWindow.definition.ts";

// Re-export pure functions so existing imports keep working
export {
  buildSlotsFromConfig,
  computeExpectedMargin,
  createDefaultTier,
  createDefaultWheelConfig,
  createWheelSale,
  easeOutQuart,
  seedToIndex
} from "./wheelHelpers.ts";

export const WheelWindow = {
  ...wheelWindowDefinition,
  components: {
    WheelHistoryPanel,
    WheelInspector,
    MysteryGridSurface,
    WheelActionRail,
    WheelStageSummary,
    WheelStageTopbar
  }
};
