import { app } from "@azure/functions";
import * as handlers from "../features/game/publicSessionHandler";

const ROUTES = [
  ["Create", ["POST", "OPTIONS"], "", "gamePublicSessionCreate"],
  ["Publish", ["POST", "OPTIONS"], "/publish", "gamePublicSessionPublish"],
  ["Get", ["GET", "OPTIONS"], "/{publicSessionId}", "gamePublicSessionGet"],
  ["RealtimeTokenGet", ["GET", "OPTIONS"], "/{publicSessionId}/realtime-token", "gamePublicSessionRealtimeTokenGet"],
  ["SpectatorCountGet", ["GET", "OPTIONS"], "/{publicSessionId}/spectator-count", "gamePublicSessionSpectatorCountGet"]
] as const;

export function registerGamePublicSessionRoutes(namespace: "game" | "wheel"): void {
  for (const [name, methods, suffix, handler] of ROUTES) {
    app.http(`${namespace}PublicSession${name}`, {
      methods: [...methods],
      authLevel: "anonymous",
      route: `${namespace}/public-session${suffix}`,
      handler: handlers[handler]
    });
  }
}
