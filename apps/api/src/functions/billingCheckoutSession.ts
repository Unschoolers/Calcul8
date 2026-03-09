import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { createStripeCheckoutSession, type StripeCheckoutUiMode } from "../lib/stripe";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";

async function resolveStripeUiMode(request: HttpRequest): Promise<StripeCheckoutUiMode> {
  if (typeof request.json !== "function") {
    return "hosted";
  }

  try {
    const body = await request.json() as { uiMode?: unknown } | null;
    return body?.uiMode === "embedded" ? "embedded" : "hosted";
  } catch {
    return "hosted";
  }
}

export async function billingCheckoutSession(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const uiMode = await resolveStripeUiMode(request);
    const userId = await resolveUserId(request, config);
    const session = await createStripeCheckoutSession({
      secretKey: String(config.stripeSecretKey || ""),
      priceId: String(config.stripeOneTimePriceId || ""),
      successUrl: String(config.stripeSuccessUrl || ""),
      cancelUrl: String(config.stripeCancelUrl || ""),
      clientReferenceId: userId,
      uiMode,
      metadata: {
        userId,
        purchaseType: "one_time_pro_unlock"
      }
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      provider: "stripe",
      mode: "payment",
      uiMode,
      sessionId: session.id,
      checkoutUrl: session.url || null,
      clientSecret: session.client_secret || null
    });
  } catch (error) {
    context.error("POST /billing/checkout-session failed", error);
    return errorResponse(request, config, error, "Failed to create Stripe checkout session.");
  }
}

app.http("billingCheckoutSession", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "billing/checkout-session",
  handler: billingCheckoutSession
});
