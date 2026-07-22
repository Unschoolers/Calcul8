import { registerGamePublicSessionRoutes } from "./registerGamePublicSessionRoutes";

export {
  gamePublicSessionCreate as wheelPublicSessionCreate,
  gamePublicSessionGet as wheelPublicSessionGet,
  gamePublicSessionPublish as wheelPublicSessionPublish,
  gamePublicSessionRealtimeTokenGet as wheelPublicSessionRealtimeTokenGet,
  gamePublicSessionSpectatorCountGet as wheelPublicSessionSpectatorCountGet
} from "../features/game/publicSessionHandler";

registerGamePublicSessionRoutes("wheel");
