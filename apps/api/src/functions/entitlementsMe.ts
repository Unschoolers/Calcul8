import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEntitlement, listPlayPurchasesForUser, upsertEntitlement } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight } from "../lib/http";
import { hasValidProPurchase } from "../lib/playEntitlements";
import { buildLegacyUserEntitlementDocumentId } from "../lib/scopeKeys";

export async function entitlementsMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

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

    // Self-heal: if entitlement row is false but a valid purchase record exists, restore pro access.
    if (!entitlement.hasProAccess) {
      const purchases = await listPlayPurchasesForUser(config, userId);
      if (hasValidProPurchase(purchases, config.googlePlayProProductIds)) {
        entitlement = await upsertEntitlement(config, {
          ...entitlement,
          hasProAccess: true,
          purchaseSource: "google_play",
          updatedAt: new Date().toISOString()
        });
      }
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

app.http("entitlementsMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/me",
  handler: entitlementsMe
});
