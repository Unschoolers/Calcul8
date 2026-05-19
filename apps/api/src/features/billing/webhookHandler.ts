import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getConfig } from "../../lib/config";
import {
  claimStripeWebhookEvent,
  listPlayPurchasesForUser,
  listStripeEntitlementFactsForUser,
  upsertEntitlement,
  upsertStripeEntitlementFact
} from "../../lib/cosmos/entitlementRepository";
import { stripeEntitlementFactId } from "../../lib/cosmos/ids";
import { deriveEntitlementState } from "../../lib/entitlementFacts";
import { maybeHandleHttpGuards } from "../../lib/http";
import { buildLegacyUserEntitlementDocumentId } from "../../lib/scopeKeys";
import { verifyStripeWebhookEvent, type StripeWebhookEvent } from "../../lib/stripe";
import type {
  StripeEntitlementFactDocument,
  StripeEntitlementObjectType
} from "../../types";

interface StripeCheckoutSessionPayload {
  id?: string;
  mode?: string;
  payment_status?: string;
  subscription?: unknown;
  client_reference_id?: string;
  metadata?: Record<string, unknown>;
}

interface StripeSubscriptionPayload {
  id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface StripeEntitlementUpdate {
  userId: string;
  stripeObjectId: string;
  stripeObjectType: StripeEntitlementObjectType;
  active: boolean;
  mode?: string;
  status?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStripeObjectId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (isRecord(value)) return readString(value.id);
  return "";
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
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
      const stripeObjectId = readString(checkout.id);
      if (!stripeObjectId) return null;
      return {
        userId,
        stripeObjectId,
        stripeObjectType: "checkout_session",
        active: true,
        mode,
        status: paymentStatus || undefined
      };
    }

    if (mode === "subscription") {
      const userId = resolveStripeUserId(checkout);
      if (!userId) return null;
      const stripeObjectId = readStripeObjectId(checkout.subscription);
      if (!stripeObjectId) return null;
      return {
        userId,
        stripeObjectId,
        stripeObjectType: "subscription",
        active: true,
        mode,
        status: paymentStatus || undefined
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
    const stripeObjectId = readString(subscription.id);
    if (!stripeObjectId) return null;

    return {
      userId,
      stripeObjectId,
      stripeObjectType: "subscription",
      active: hasProAccess,
      status
    };
  }

  return null;
}

function mergeStripeFact(
  facts: StripeEntitlementFactDocument[],
  changedFact: StripeEntitlementFactDocument
): StripeEntitlementFactDocument[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  byId.set(changedFact.id, changedFact);
  return [...byId.values()];
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
    const updatedAt = new Date().toISOString();
    const claimed = await claimStripeWebhookEvent(config, {
      userId: entitlementUpdate.userId,
      stripeEventId: event.id,
      eventType: event.type,
      processedAt: updatedAt
    });
    if (!claimed) {
      return createResponse(200, {
        received: true,
        eventId: event.id,
        handled: true,
        duplicate: true,
        updated: false
      });
    }

    const changedFact = await upsertStripeEntitlementFact(config, {
      id: stripeEntitlementFactId(
        entitlementUpdate.userId,
        entitlementUpdate.stripeObjectType,
        entitlementUpdate.stripeObjectId
      ),
      docType: "stripe_entitlement_fact",
      userId: entitlementUpdate.userId,
      stripeObjectId: entitlementUpdate.stripeObjectId,
      stripeObjectType: entitlementUpdate.stripeObjectType,
      active: entitlementUpdate.active,
      sourceEventId: event.id,
      sourceEventType: event.type,
      sourceEventCreated: readFiniteNumber(event.created),
      mode: entitlementUpdate.mode,
      status: entitlementUpdate.status,
      createdAt: updatedAt,
      updatedAt
    });
    const [playPurchases, stripeFacts] = await Promise.all([
      listPlayPurchasesForUser(config, entitlementUpdate.userId),
      listStripeEntitlementFactsForUser(config, entitlementUpdate.userId)
    ]);
    const derivedState = deriveEntitlementState({
      playPurchases,
      stripeFacts: mergeStripeFact(stripeFacts, changedFact),
      allowedPlayProductIds: config.googlePlayProProductIds,
      now: updatedAt
    });

    await upsertEntitlement(config, {
      id: buildLegacyUserEntitlementDocumentId(entitlementUpdate.userId),
      userId: entitlementUpdate.userId,
      hasProAccess: derivedState.hasProAccess,
      purchaseSource: derivedState.purchaseSource,
      updatedAt: derivedState.updatedAt
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
