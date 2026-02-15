import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot, getEntitlement } from "../lib/cosmos";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";

export async function accountExport(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const userId = await resolveUserId(request, config);
    const entitlement = await getEntitlement(config, userId);
    const syncSnapshot = await getEffectiveSyncSnapshot(config, userId);

    return jsonResponse(request, config, 200, {
      userId,
      exportedAt: new Date().toISOString(),
      entitlement: entitlement ?? null,
      syncSnapshot: syncSnapshot ?? null
    });
  } catch (error) {
    context.error("POST /account/export failed", error);
    return errorResponse(request, config, error, "Failed to export account data.");
  }
}

app.http("accountExport", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/export",
  handler: accountExport
});
