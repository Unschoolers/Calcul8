import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { deleteAllSyncData, deleteEntitlement, deletePlayPurchasesForUser } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight, maybeHandleGlobalRateLimit } from "../lib/http";

export async function accountDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = maybeHandleGlobalRateLimit(request, config);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const userId = await resolveUserId(request, config);

    await Promise.all([
      deleteEntitlement(config, userId),
      deletePlayPurchasesForUser(config, userId),
      deleteAllSyncData(config, userId)
    ]);

    const deletedAt = new Date().toISOString();
    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      deletedAt
    });
  } catch (error) {
    context.error("POST /account/delete failed", error);
    return errorResponse(request, config, error, "Failed to delete account data.");
  }
}

app.http("accountDelete", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/delete",
  handler: accountDelete
});
