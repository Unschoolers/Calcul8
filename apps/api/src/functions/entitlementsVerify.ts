import { app } from "@azure/functions";
import { entitlementsVerify } from "../features/entitlements/verifyHandler";

export { entitlementsVerify } from "../features/entitlements/verifyHandler";

app.http("entitlementsVerify", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/verify/{provider}",
  handler: entitlementsVerify
});
