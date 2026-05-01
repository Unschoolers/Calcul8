import "./styles/WheelWindow.css";
import WheelActionRail from "./stage/WheelActionRail.vue";
import WheelCreateGameDialog from "./dialogs/WheelCreateGameDialog.vue";
import WheelHistoryPanel from "./inspector/WheelHistoryPanel.vue";
import WheelInspector from "./inspector/WheelInspector.vue";
import MysteryGridSurface from "./stage/MysteryGridSurface.vue";
import WheelSpectatorDialog from "./dialogs/WheelSpectatorDialog.vue";
import WheelStageSummary from "./stage/WheelStageSummary.vue";
import WheelStageTopbar from "./stage/WheelStageTopbar.vue";
import { wheelWindowDefinition } from "./coordinator/WheelWindow.definition.ts";

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
    WheelCreateGameDialog,
    WheelSpectatorDialog,
    WheelStageSummary,
    WheelStageTopbar
  }
};
