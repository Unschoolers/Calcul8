import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../../lib/auth";
import { createStripeCheckoutSession, type StripeCheckoutUiMode } from "../../lib/stripe";
import { executeHttpHandler, jsonResponse } from "../../lib/http";

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
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /billing/checkout-session failed",
    fallbackErrorMessage: "Failed to create Stripe checkout session.",
    operation: async ({ config }) => {
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
    }
  });
}
