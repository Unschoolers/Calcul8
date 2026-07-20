import { app } from "@azure/functions";
import { buyerProfilesRoute } from "../features/buyerProfiles/handlers";

export { buyerProfilesRoute } from "../features/buyerProfiles/handlers";

app.http("buyerProfiles", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "buyer-profiles",
  handler: buyerProfilesRoute
});
