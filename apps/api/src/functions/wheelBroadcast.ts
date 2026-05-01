import { app } from "@azure/functions";
import { wheelBroadcast } from "../features/wheel/broadcastHandler";

export { wheelBroadcast } from "../features/wheel/broadcastHandler";

app.http("wheelBroadcast", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/broadcast",
  handler: wheelBroadcast
});
