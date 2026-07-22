import type { GamePublicSessionSnapshot } from "../../../shared/game-public-session-contracts.cjs";
import type { SyncGameSessionDto } from "../../../shared/sync-contracts.cjs";

export type CommonJsContractConsumer = {
  game: GamePublicSessionSnapshot;
  sync: SyncGameSessionDto;
};
