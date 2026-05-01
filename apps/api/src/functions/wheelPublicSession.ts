import { app } from "@azure/functions";
import { wheelPublicSessionCreate, wheelPublicSessionPublish, wheelPublicSessionGet, wheelPublicSessionRealtimeTokenGet, wheelPublicSessionSpectatorCountGet } from "../features/wheel/publicSessionHandler";

export { wheelPublicSessionCreate, wheelPublicSessionPublish, wheelPublicSessionGet, wheelPublicSessionRealtimeTokenGet, wheelPublicSessionSpectatorCountGet } from "../features/wheel/publicSessionHandler";

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
