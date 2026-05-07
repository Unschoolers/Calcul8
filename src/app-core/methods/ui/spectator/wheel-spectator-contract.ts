export type {
  GameSpectatorSnapshot,
  WheelSpectatorSnapshot
} from "../../../../types/app.ts";

export {
  CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeGameSpectatorSnapshot,
  normalizeGameSpectatorSnapshot as normalizeWheelSpectatorSnapshot
} from "../../../../../shared/game-public-session-contracts.mjs";
