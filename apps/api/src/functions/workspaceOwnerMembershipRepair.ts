import { app } from "@azure/functions";
import { workspaceOwnerMembershipRepair } from "../features/migrations/workspaceOwnerMembershipHandler";

export { workspaceOwnerMembershipRepair } from "../features/migrations/workspaceOwnerMembershipHandler";

app.http("workspaceOwnerMembershipRepair", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "migrations/workspace-owner-memberships",
  handler: workspaceOwnerMembershipRepair
});
