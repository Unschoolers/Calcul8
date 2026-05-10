import { renderBracketState } from "./bracketSpectatorRender.ts";
import { renderEmpty } from "./spectatorRenderShared.ts";
import { SPECTATOR_WHEEL_CANVAS_ID, type SpectatorPageState } from "./spectatorRenderTypes.ts";
import { renderWheelOrGridState } from "./wheelGridSpectatorRender.ts";

export { SPECTATOR_WHEEL_CANVAS_ID, type SpectatorPageState };

export function renderSpectatorState(state: SpectatorPageState): string {
  if (state.status === "loading") {
    return renderEmpty("Loading the game", "Pulling the latest spectator snapshot...");
  }
  if (state.status === "not_found") {
    return renderEmpty("Session not found", "This spectator link is missing or has already been cleared.");
  }
  if (state.status === "error") {
    return renderEmpty("Could not load the game", "Refresh in a moment to try again.");
  }

  return state.snapshot.gameType === "bracket"
    ? renderBracketState(state)
    : renderWheelOrGridState(state);
}
