import { app } from "@azure/functions";
import { billingWebhook } from "../features/billing/webhookHandler";

export { billingWebhook } from "../features/billing/webhookHandler";

app.http("billingWebhook", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "billing/webhook",
  handler: billingWebhook
});
