export type {
  GameSpectatorSnapshot
} from "../../../../types/app.ts";

import type { GameSpectatorSnapshot } from "../../../../types/app.ts";
import {
  CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeGameSpectatorSnapshot as normalizeSharedGameSpectatorSnapshot
} from "../../../../../shared/game-public-session-contracts.mjs";

export { CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION };

export function normalizeGameSpectatorSnapshot(
  value: unknown,
  fallbackUpdatedAt?: number
): GameSpectatorSnapshot | null {
  return normalizeSharedGameSpectatorSnapshot(value, fallbackUpdatedAt) as GameSpectatorSnapshot | null;
}
