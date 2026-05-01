import { app } from "@azure/functions";
import { syncPush } from "../features/sync/pushHandler";

export { syncPush } from "../features/sync/pushHandler";

app.http("syncPush", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sync/push",
  handler: syncPush
});
