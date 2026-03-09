import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getConfig } from "../lib/config";
import { getEntitlement, upsertEntitlement } from "../lib/cosmos";
import { maybeHandleHttpGuards } from "../lib/http";
import { buildLegacyUserEntitlementDocumentId } from "../lib/scopeKeys";
import { verifyStripeWebhookEvent, type StripeWebhookEvent } from "../lib/stripe";

interface StripeCheckoutSessionPayload {
  mode?: string;
  payment_status?: string;
  client_reference_id?: string;
  metadata?: Record<string, unknown>;
}

interface StripeSubscriptionPayload {
  status?: string;
  metadata?: Record<string, unknown>;
}

interface StripeEntitlementUpdate {
  userId: string;
  hasProAccess: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveStripeUserId(payload: Record<string, unknown>): string {
  const byClientReference = readString(payload.client_reference_id);
  if (byClientReference) return byClientReference;

  const metadata = payload.metadata;
  if (!isRecord(metadata)) return "";
  const byMetadata = readString(metadata.userId);
  if (byMetadata) return byMetadata;
  return "";
}

function resolveStripeSubscriptionEntitlement(status: string): boolean | null {
  if (!status) return null;
  if (status === "active" || status === "trialing") return true;
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired" || status === "paused") {
    return false;
  }
  return null;
}

function resolveEntitlementUpdate(event: StripeWebhookEvent): StripeEntitlementUpdate | null {
  const payload = event.data.object;
  if (!isRecord(payload)) return null;

  if (event.type === "checkout.session.completed") {
    const checkout = payload as StripeCheckoutSessionPayload & Record<string, unknown>;
    const mode = readString(checkout.mode);
    const paymentStatus = readString(checkout.payment_status);

    if (mode === "payment") {
      if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
        return null;
      }
      const userId = resolveStripeUserId(checkout);
      if (!userId) return null;
      return {
        userId,
        hasProAccess: true
      };
    }

    if (mode === "subscription") {
      const userId = resolveStripeUserId(checkout);
      if (!userId) return null;
      return {
        userId,
        hasProAccess: true
      };
    }
  }

  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
  ) {
    const subscription = payload as StripeSubscriptionPayload & Record<string, unknown>;
    const status = readString(subscription.status);
    const hasProAccess = resolveStripeSubscriptionEntitlement(status);
    if (hasProAccess == null) return null;

    const userId = resolveStripeUserId(subscription);
    if (!userId) return null;

    return {
      userId,
      hasProAccess
    };
  }

  return null;
}

function createResponse(status: number, body: Record<string, unknown>): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    jsonBody: body
  };
}

export async function billingWebhook(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  const signatureHeader = readString(request.headers.get("stripe-signature"));
  if (!signatureHeader) {
    return createResponse(400, {
      error: "Missing Stripe signature header."
    });
  }

  const rawBody = await request.text();

  let event: StripeWebhookEvent;
  try {
    event = verifyStripeWebhookEvent(
      rawBody,
      signatureHeader,
      String(config.stripeWebhookSecret || "")
    );
  } catch (error) {
    context.warn("Stripe webhook rejected", {
      error: error instanceof Error ? error.message : String(error)
    });
    return createResponse(400, {
      error: "Invalid Stripe webhook signature."
    });
  }

  const entitlementUpdate = resolveEntitlementUpdate(event);
  if (!entitlementUpdate) {
    return createResponse(200, {
      received: true,
      eventId: event.id,
      handled: false
    });
  }

  try {
    const existingEntitlement = await getEntitlement(config, entitlementUpdate.userId);
    await upsertEntitlement(config, {
      id: buildLegacyUserEntitlementDocumentId(entitlementUpdate.userId),
      userId: entitlementUpdate.userId,
      hasProAccess: entitlementUpdate.hasProAccess,
      purchaseSource: entitlementUpdate.hasProAccess
        ? "stripe"
        : (existingEntitlement?.purchaseSource ?? "stripe"),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    context.error("Stripe webhook entitlement update failed", error);
    return createResponse(500, {
      received: true,
      eventId: event.id,
      handled: true,
      updated: false
    });
  }

  return createResponse(200, {
    received: true,
    eventId: event.id,
    handled: true,
    updated: true
  });
}

app.http("billingWebhook", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "billing/webhook",
  handler: billingWebhook
});
