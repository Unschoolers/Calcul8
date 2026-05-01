import { app } from "@azure/functions";
import { migrationRunsList } from "../features/migrations/runsListHandler";

export { migrationRunsList } from "../features/migrations/runsListHandler";

app.http("migrationRunsList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "migrations/runs",
  handler: migrationRunsList
});
