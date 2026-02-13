import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEntitlement } from "../lib/cosmos";
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
    const userId = resolveUserId(request, config);
    const entitlement = await getEntitlement(config, userId);

    return jsonResponse(request, config, 200, {
      userId,
      hasProAccess: entitlement?.hasProAccess ?? false,
      updatedAt: entitlement?.updatedAt ?? null
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
