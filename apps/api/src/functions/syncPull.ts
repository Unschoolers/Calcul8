import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight } from "../lib/http";
import { withDualSyncShape } from "../lib/syncShape";

const EMPTY_SYNC_SNAPSHOT = withDualSyncShape({
  presets: [],
  salesByPreset: {},
  version: 0,
  updatedAt: null
});

export async function syncPull(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  try {
    const userId = await resolveUserId(request, config);
    const snapshot = await getEffectiveSyncSnapshot(config, userId);
    const normalizedSnapshot = snapshot ? withDualSyncShape(snapshot) : EMPTY_SYNC_SNAPSHOT;

    return jsonResponse(request, config, 200, {
      userId,
      snapshot: normalizedSnapshot
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
