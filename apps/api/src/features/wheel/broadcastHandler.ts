import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { getConfig } from "../../lib/config";
import { hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import { publishWorkspaceWheelRealtimeEventBestEffort } from "../../lib/realtime";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../../lib/syncScopeResolution";
import { readRequestJsonOrThrow, requireRequestBodyRecord } from "../../lib/httpRequest";
import { normalizeSyncGameSessionDto } from "../../shared/sync-contracts.cjs";
import type { SyncGameSessionDto } from "../../types";

function parseWheelBroadcastBody(rawBody: unknown): {
  workspaceId: string;
  session: SyncGameSessionDto;
} {
  const body = requireRequestBodyRecord(rawBody) as {
    workspaceId?: unknown;
    session?: unknown;
  };

  const workspaceId = parseOptionalWorkspaceId(body.workspaceId);
  if (!workspaceId) {
    throw new HttpError(400, "Field 'workspaceId' is required.");
  }

  if (typeof body.session !== "object" || body.session === null || Array.isArray(body.session)) {
    throw new HttpError(400, "Field 'session' is required and must be an object.");
  }

  return {
    workspaceId,
    session: normalizeSyncGameSessionDto(body.session)
  };
}

export async function wheelBroadcast(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "wheel_broadcast",
        workspaceScope: "workspace"
      }
    });

    const body = parseWheelBroadcastBody(await readRequestJsonOrThrow(request));

    const syncScope = resolveSyncScope(actorUserId, body.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, workspaceId) => hasWorkspaceMembership(config, userId, workspaceId)
    );

    publishWorkspaceWheelRealtimeEventBestEffort(config, {
      workspaceId: body.workspaceId,
      eventType: "wheel.session.updated",
      data: body.session,
      logger: context
    });

    return jsonResponse(request, config, 200, { ok: true });
  } catch (error) {
    context.error("Failed to broadcast wheel session.", error);
    return errorResponse(request, config, error, "Failed to broadcast wheel session.");
  }
}
