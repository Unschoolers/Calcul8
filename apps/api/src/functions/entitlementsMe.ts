import { app } from "@azure/functions";
import { entitlementsMe } from "../features/entitlements/meHandler";

export { entitlementsMe } from "../features/entitlements/meHandler";

app.http("entitlementsMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/me",
  handler: entitlementsMe
});
