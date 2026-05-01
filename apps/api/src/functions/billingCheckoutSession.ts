import { app } from "@azure/functions";
import { billingCheckoutSession } from "../features/billing/checkoutSessionHandler";

export { billingCheckoutSession } from "../features/billing/checkoutSessionHandler";

app.http("billingCheckoutSession", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "billing/checkout-session",
  handler: billingCheckoutSession
});
