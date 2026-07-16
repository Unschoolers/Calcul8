import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../../lib/auth";
import {
  getEntitlement,
  listPlayPurchasesForUser,
  listStripeEntitlementFactsForUser,
  upsertEntitlement
} from "../../lib/cosmos/entitlementRepository";
import { getConfig } from "../../lib/config";
import { deriveEntitlementState, entitlementStateMatches } from "../../lib/entitlementFacts";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import { buildLegacyUserEntitlementDocumentId } from "../../lib/scopeKeys";

export async function entitlementsMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = await maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const userId = await resolveUserId(request, config);
    const existingEntitlement = await getEntitlement(config, userId);
    let entitlement = existingEntitlement
      ?? await upsertEntitlement(config, {
        id: buildLegacyUserEntitlementDocumentId(userId),
        userId,
        hasProAccess: false,
        updatedAt: new Date().toISOString()
      });

    const [playPurchases, stripeFacts] = await Promise.all([
      listPlayPurchasesForUser(config, userId),
      listStripeEntitlementFactsForUser(config, userId)
    ]);
    const derivedState = deriveEntitlementState({
      existingEntitlement: entitlement,
      playPurchases,
      stripeFacts,
      allowedPlayProductIds: config.googlePlayProProductIds,
      now: new Date().toISOString(),
      allowLegacyFallback: true
    });

    if (!entitlementStateMatches(entitlement, derivedState)) {
      entitlement = await upsertEntitlement(config, {
        id: buildLegacyUserEntitlementDocumentId(userId),
        userId,
        hasProAccess: derivedState.hasProAccess,
        purchaseSource: derivedState.purchaseSource,
        updatedAt: derivedState.updatedAt
      });
    }

    return jsonResponse(request, config, 200, {
      userId,
      hasProAccess: entitlement?.hasProAccess ?? false,
      updatedAt: entitlement?.updatedAt ?? null,
      purchaseSource: entitlement?.purchaseSource ?? null
    });
  } catch (error) {
    context.error("GET /entitlements/me failed", error);
    return errorResponse(request, config, error, "Failed to load entitlements.");
  }
}
