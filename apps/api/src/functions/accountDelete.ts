import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { deleteAllSyncData, deleteEntitlement } from "../lib/cosmos";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";

export async function accountDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const userId = await resolveUserId(request, config);

    await Promise.all([
      deleteEntitlement(config, userId),
      deleteAllSyncData(config, userId)
    ]);

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      deletedAt: new Date().toISOString()
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
