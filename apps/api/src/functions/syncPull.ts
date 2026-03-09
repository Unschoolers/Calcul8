import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot, hasWorkspaceMembership } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight, maybeHandleGlobalRateLimit } from "../lib/http";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope, shouldWarnWorkspaceScopeFallback } from "../lib/syncScopeResolution";
import type { SyncPullPayload } from "../types";

const EMPTY_SYNC_SNAPSHOT = {
  lots: [],
  salesByLot: {},
  version: 0,
  updatedAt: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseSyncPullPayload(request: HttpRequest): Promise<SyncPullPayload> {
  if (typeof request.json !== "function") {
    return {};
  }

  try {
    const payload = await request.json();
    if (!isRecord(payload)) return {};
    return {
      workspaceId: parseOptionalWorkspaceId(payload.workspaceId)
    };
  } catch {
    return {};
  }
}

export async function syncPull(
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
    const payload = await parseSyncPullPayload(request);
    const syncScope = resolveSyncScope(userId, payload.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (actorUserId, workspaceId) => hasWorkspaceMembership(config, actorUserId, workspaceId)
    );

    if (shouldWarnWorkspaceScopeFallback(syncScope)) {
      context.warn("workspaceId provided but workspace sync scope is not enabled yet; using personal scope.", {
        userId,
        workspaceId: payload.workspaceId,
        partitionKey: syncScope.partitionKey
      });
    }
    const snapshot = await getEffectiveSyncSnapshot(config, syncScope.partitionKey);

    return jsonResponse(request, config, 200, {
      userId,
      snapshot: snapshot ?? EMPTY_SYNC_SNAPSHOT
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
