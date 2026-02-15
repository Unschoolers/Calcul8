import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot } from "../lib/cosmos";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";

export async function syncPull(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const userId = await resolveUserId(request, config);
    const snapshot = await getEffectiveSyncSnapshot(config, userId);

    return jsonResponse(request, config, 200, {
      userId,
      snapshot: snapshot ?? {
        presets: [],
        salesByPreset: {},
        version: 0,
        updatedAt: null
      }
    });
  } catch (error) {
    context.error("POST /sync/pull failed", error);
    return errorResponse(request, config, error, "Failed to load cloud sync data.");
  }
}

app.http("syncPull", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sync/pull",
  handler: syncPull
});
