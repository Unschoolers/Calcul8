import type { GamePublicSessionSnapshot } from "../../../shared/game-public-session-contracts.cjs";
import type { SyncGameSessionDto } from "../../../shared/sync-contracts.cjs";

export type CommonJsContractConsumer = {
  game: GamePublicSessionSnapshot;
  sync: SyncGameSessionDto;
};

import { calculateSealedBoxInventory } from "../../../shared/box-inventory.cjs";
import { buildEntitlementScopeKey } from "../../../shared/scope-keys.cjs";
import { normalizeSyncGameSessionDto } from "../../../shared/sync-contracts.cjs";
import { normalizeWhatnotImportDecision } from "../../../shared/whatnot-import-contracts.cjs";
import { buildWorkspaceLotRealtimeRoom } from "../../../shared/workspace-realtime-rooms.cjs";
import { normalizeSyncGameSessionDto as normalizeApiSession } from "../../../apps/api/src/shared/sync-contracts.cjs";

export const inventory = calculateSealedBoxInventory({ boxesPurchased: 1, packsPerBox: 10 }, []);
export const scope = buildEntitlementScopeKey("workspace", "team-42");
export const session: SyncGameSessionDto = normalizeSyncGameSessionDto(null, 999);
export const apiSession: SyncGameSessionDto = normalizeApiSession(null, 999);
export const decision = normalizeWhatnotImportDecision(null);
export const room = buildWorkspaceLotRealtimeRoom("team-42", 7);
