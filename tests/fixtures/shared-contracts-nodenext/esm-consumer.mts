import type { GamePublicSessionSnapshot } from "../../../shared/game-public-session-contracts.mjs";
import type { SyncGameSessionDto } from "../../../shared/sync-contracts.mjs";

export type EsmContractConsumer = {
  game: GamePublicSessionSnapshot;
  sync: SyncGameSessionDto;
};

import { calculateSealedBoxInventory } from "../../../shared/box-inventory.mjs";
import { buildEntitlementScopeKey } from "../../../shared/scope-keys.mjs";
import { normalizeSyncGameSessionDto } from "../../../shared/sync-contracts.mjs";
import { normalizeWhatnotImportDecision } from "../../../shared/whatnot-import-contracts.mjs";
import { buildWorkspaceLotRealtimeRoom } from "../../../shared/workspace-realtime-rooms.mjs";

export const inventory = calculateSealedBoxInventory({ boxesPurchased: 1, packsPerBox: 10 }, []);
export const scope = buildEntitlementScopeKey("workspace", "team-42");
export const session: SyncGameSessionDto = normalizeSyncGameSessionDto(null, 999);
export const decision = normalizeWhatnotImportDecision(null);
export const room = buildWorkspaceLotRealtimeRoom("team-42", 7);
