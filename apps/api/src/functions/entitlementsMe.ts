import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEntitlement, upsertEntitlement } from "../lib/cosmos";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";

export async function entitlementsMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const userId = await resolveUserId(request, config);
    const existingEntitlement = await getEntitlement(config, userId);
    const entitlement = existingEntitlement
      ?? await upsertEntitlement(config, {
        id: `entitlement:${userId}`,
        userId,
        hasProAccess: false,
        updatedAt: new Date().toISOString()
      });

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
