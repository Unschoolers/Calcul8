import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { getEffectiveSyncSnapshot } from "../lib/cosmos/syncSnapshotRepository";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { getConfig } from "../lib/config";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope, shouldWarnWorkspaceScopeFallback } from "../lib/syncScopeResolution";
import { logApiTelemetry } from "../lib/telemetry";
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
  let workspaceId: string | undefined;
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const userId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "sync_pull",
        workspaceScope: "unknown"
      }
    });
    const payload = await parseSyncPullPayload(request);
    workspaceId = payload.workspaceId;
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
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
    if (status === 401 || status === 403 || status === 409) {
      logApiTelemetry({
        logger: context,
        level: "warn",
        request,
        config,
        route: "sync_pull",
        workspaceScope: workspaceId ? "workspace" : "personal",
        outcome: `http_${status}`
      });
    }
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
