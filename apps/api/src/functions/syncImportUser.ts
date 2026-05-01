import { app } from "@azure/functions";
import { syncImportUser } from "../features/sync/importUserHandler";

export { syncImportUser } from "../features/sync/importUserHandler";

app.http("syncImportUser", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ops/sync/import-user",
  handler: syncImportUser
});
