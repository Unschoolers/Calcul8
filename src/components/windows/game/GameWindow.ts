import "./styles/GameWindow.css";
import BracketBattlePanel from "./bracket/BracketBattlePanel.vue";
import WheelActionRail from "./stage/WheelActionRail.vue";
import WheelCreateGameDialog from "./dialogs/WheelCreateGameDialog.vue";
import GameStageOverlayShell from "./overlay/GameStageOverlayShell.vue";
import WheelHistoryPanel from "./inspector/WheelHistoryPanel.vue";
import WheelInspector from "./inspector/WheelInspector.vue";
import MysteryGridSurface from "./stage/MysteryGridSurface.vue";
import GameSpectatorDialog from "./dialogs/GameSpectatorDialog.vue";
import WheelStageSummary from "./stage/WheelStageSummary.vue";
import WheelStageTopbar from "./stage/WheelStageTopbar.vue";
import { gameWindowDefinition } from "./coordinator/GameWindow.definition.ts";

export const GameWindow = {
  ...gameWindowDefinition,
  components: {
    BracketBattlePanel,
    GameStageOverlayShell,
    WheelHistoryPanel,
    WheelInspector,
    MysteryGridSurface,
    WheelActionRail,
    WheelCreateGameDialog,
    GameSpectatorDialog,
    WheelStageSummary,
    WheelStageTopbar
  }
};
