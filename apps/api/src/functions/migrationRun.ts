import { app } from "@azure/functions";
import { migrationRun } from "../features/migrations/runHandler";

export { migrationRun } from "../features/migrations/runHandler";

app.http("migrationRun", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "migrations/run",
  handler: migrationRun
});
