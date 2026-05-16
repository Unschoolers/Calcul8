import { app } from "@azure/functions";
import {
  gamePublicSessionCreate as wheelPublicSessionCreate,
  gamePublicSessionGet as wheelPublicSessionGet,
  gamePublicSessionPublish as wheelPublicSessionPublish,
  gamePublicSessionRealtimeTokenGet as wheelPublicSessionRealtimeTokenGet,
  gamePublicSessionSpectatorCountGet as wheelPublicSessionSpectatorCountGet
} from "../features/game/publicSessionHandler";

export {
  wheelPublicSessionCreate,
  wheelPublicSessionGet,
  wheelPublicSessionPublish,
  wheelPublicSessionRealtimeTokenGet,
  wheelPublicSessionSpectatorCountGet
};

app.http("wheelPublicSessionCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session",
  handler: wheelPublicSessionCreate
});

app.http("wheelPublicSessionPublish", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/publish",
  handler: wheelPublicSessionPublish
});

app.http("wheelPublicSessionGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/{publicSessionId}",
  handler: wheelPublicSessionGet
});

app.http("wheelPublicSessionRealtimeTokenGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/{publicSessionId}/realtime-token",
  handler: wheelPublicSessionRealtimeTokenGet
});

app.http("wheelPublicSessionSpectatorCountGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/{publicSessionId}/spectator-count",
  handler: wheelPublicSessionSpectatorCountGet
});
