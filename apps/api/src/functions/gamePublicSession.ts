import { registerGamePublicSessionRoutes } from "./registerGamePublicSessionRoutes";

export {
  gamePublicSessionCreate,
  gamePublicSessionGet,
  gamePublicSessionPublish,
  gamePublicSessionRealtimeTokenGet,
  gamePublicSessionSpectatorCountGet
} from "../features/game/publicSessionHandler";

registerGamePublicSessionRoutes("game");
