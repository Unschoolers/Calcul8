import { app } from "@azure/functions";
import { syncPull } from "../features/sync/pullHandler";

export { syncPull } from "../features/sync/pullHandler";

app.http("syncPull", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sync/pull",
  handler: syncPull
});
