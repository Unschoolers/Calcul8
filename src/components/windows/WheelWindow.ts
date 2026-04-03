import "./WheelWindow.css";
import WheelActionRail from "./WheelActionRail.vue";
import WheelInspector from "./WheelInspector.vue";
import { wheelWindowDefinition } from "./WheelWindow.definition.ts";

// Re-export pure functions so existing imports keep working
export {
  buildSlotsFromConfig,
  createDefaultTier,
  createDefaultWheelConfig,
  createWheelSale,
  easeOutQuart,
  seedToIndex
} from "./wheelHelpers.ts";

export const WheelWindow = {
  ...wheelWindowDefinition,
  components: {
    WheelInspector,
    WheelActionRail
  }
};
