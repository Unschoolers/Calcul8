import type { GamePublicSessionSnapshot } from "../../../shared/game-public-session-contracts.mjs";
import type { SyncGameSessionDto } from "../../../shared/sync-contracts.mjs";

export type EsmContractConsumer = {
  game: GamePublicSessionSnapshot;
  sync: SyncGameSessionDto;
};
