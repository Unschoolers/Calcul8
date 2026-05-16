import { app } from "@azure/functions";
import {
  gamePublicSessionCreate,
  gamePublicSessionGet,
  gamePublicSessionPublish,
  gamePublicSessionRealtimeTokenGet,
  gamePublicSessionSpectatorCountGet
} from "../features/game/publicSessionHandler";

export {
  gamePublicSessionCreate,
  gamePublicSessionGet,
  gamePublicSessionPublish,
  gamePublicSessionRealtimeTokenGet,
  gamePublicSessionSpectatorCountGet
} from "../features/game/publicSessionHandler";

app.http("gamePublicSessionCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "game/public-session",
  handler: gamePublicSessionCreate
});

app.http("gamePublicSessionPublish", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "game/public-session/publish",
  handler: gamePublicSessionPublish
});

app.http("gamePublicSessionGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "game/public-session/{publicSessionId}",
  handler: gamePublicSessionGet
});

app.http("gamePublicSessionRealtimeTokenGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "game/public-session/{publicSessionId}/realtime-token",
  handler: gamePublicSessionRealtimeTokenGet
});

app.http("gamePublicSessionSpectatorCountGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "game/public-session/{publicSessionId}/spectator-count",
  handler: gamePublicSessionSpectatorCountGet
});
