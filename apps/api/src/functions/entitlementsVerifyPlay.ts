import { app } from "@azure/functions";
import { verifyPlayEntitlementRequest, entitlementsVerifyPlay } from "../features/entitlements/verifyPlayHandler";

export { verifyPlayEntitlementRequest, entitlementsVerifyPlay } from "../features/entitlements/verifyPlayHandler";

app.http("entitlementsVerifyPlay", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/verify-play",
  handler: entitlementsVerifyPlay
});
