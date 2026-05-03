import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { getConfig } from "../../lib/config";
import {
    createWheelPublicSession,
    getWheelPublicSession,
    updateWheelPublicSession
} from "../../lib/cosmos/wheelPublicSessionRepository";
import { hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import {
    buildWheelPublicSessionRealtimeRoom,
    getRealtimeRoomMemberCount,
    publishWheelPublicSessionRealtimeEventBestEffort,
    signRealtimeSubscribeToken
} from "../../lib/realtime";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../../lib/syncScopeResolution";
import type { WheelPublicSessionSnapshot } from "../../types";
import { normalizeWheelPublicSessionSnapshot } from "../../shared/wheel-public-session-contracts.cjs";
import {
    readRequestJsonOrThrow,
    requireRequestBodyRecord,
    requireRouteParam
} from "../../lib/httpRequest";

function buildRealtimeTokenExpiryEpochSeconds(ttlSeconds = 60): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

function sanitizeWheelPublicSessionSnapshot(value: unknown): WheelPublicSessionSnapshot {
  const snapshot = normalizeWheelPublicSessionSnapshot(value);
  if (!snapshot) {
    requireRequestBodyRecord(value, "Field 'snapshot' must be an object.");
    throw new HttpError(400, "Field 'snapshot' must be an object.");
  }
  return snapshot;
}

function parseCreateBody(rawBody: unknown): {
  workspaceId?: string;
  snapshot: WheelPublicSessionSnapshot;
} {
  const body = requireRequestBodyRecord(rawBody);
  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    snapshot: sanitizeWheelPublicSessionSnapshot(body.snapshot)
  };
}

function parsePublishBody(rawBody: unknown): {
  publicSessionId: string;
  snapshot: WheelPublicSessionSnapshot;
} {
  const body = requireRequestBodyRecord(rawBody);
  const publicSessionId = String(body.publicSessionId ?? "").trim().toLowerCase();
  if (!publicSessionId) {
    throw new HttpError(400, "Field 'publicSessionId' is required.");
  }
  return {
    publicSessionId,
    snapshot: sanitizeWheelPublicSessionSnapshot(body.snapshot)
  };
}

export async function wheelPublicSessionCreate(
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
        route: "wheel_public_session_create",
        workspaceScope: "unknown"
      }
    });
    const body = parseCreateBody(await readRequestJsonOrThrow(request));
    const syncScope = resolveSyncScope(actorUserId, body.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, workspaceId) => hasWorkspaceMembership(config, userId, workspaceId)
    );

    const document = await createWheelPublicSession(config, {
      ownerUserId: actorUserId,
      scopeType: syncScope.scopeType,
      scopeId: syncScope.scopeId,
      workspaceId: syncScope.scopeType === "workspace" ? syncScope.scopeId : null,
      snapshot: body.snapshot
    });

    return jsonResponse(request, config, 200, {
      publicSessionId: document.publicSessionId,
      snapshot: sanitizeWheelPublicSessionSnapshot(document.snapshot)
    });
  } catch (error) {
    context.error("Failed to create wheel public session.", error);
    return errorResponse(request, config, error, "Failed to create wheel public session.");
  }
}

export async function wheelPublicSessionPublish(
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
        route: "wheel_public_session_publish",
        workspaceScope: "unknown"
      }
    });
    const body = parsePublishBody(await readRequestJsonOrThrow(request));
    const updated = await updateWheelPublicSession(config, {
      publicSessionId: body.publicSessionId,
      ownerUserId: actorUserId,
      snapshot: body.snapshot
    });
    if (!updated) {
      throw new HttpError(404, "Public wheel session was not found.");
    }
    const snapshot = sanitizeWheelPublicSessionSnapshot(updated.snapshot);
    publishWheelPublicSessionRealtimeEventBestEffort(config, {
      publicSessionId: updated.publicSessionId,
      eventType: "wheel.public-session.updated",
      data: {
        publicSessionId: updated.publicSessionId,
        snapshot
      },
      logger: context
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      publicSessionId: updated.publicSessionId,
      snapshot
    });
  } catch (error) {
    context.error("Failed to publish wheel public session.", error);
    return errorResponse(request, config, error, "Failed to publish wheel public session.");
  }
}

export async function wheelPublicSessionGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const publicSessionId = requireRouteParam(request, "publicSessionId").toLowerCase();
    const document = await getWheelPublicSession(config, publicSessionId);
    if (!document) {
      throw new HttpError(404, "Public wheel session was not found.");
    }

    return jsonResponse(request, config, 200, {
      publicSessionId: document.publicSessionId,
      snapshot: sanitizeWheelPublicSessionSnapshot(document.snapshot)
    });
  } catch (error) {
    context.error("Failed to load wheel public session.", error);
    return errorResponse(request, config, error, "Failed to load wheel public session.");
  }
}

export async function wheelPublicSessionRealtimeTokenGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const publicSessionId = requireRouteParam(request, "publicSessionId").toLowerCase();
    const document = await getWheelPublicSession(config, publicSessionId);
    if (!document) {
      throw new HttpError(404, "Public wheel session was not found.");
    }

    const room = buildWheelPublicSessionRealtimeRoom(publicSessionId);
    const rooms = [room];
    const tokenSecret = String(config.realtimeTokenSecret ?? "").trim();
    if (!tokenSecret && config.apiEnv === "prod") {
      throw new HttpError(503, "Realtime subscribe signing is not configured.");
    }
    const expiresAt = buildRealtimeTokenExpiryEpochSeconds();

    return jsonResponse(request, config, 200, {
      publicSessionId,
      room,
      rooms,
      token: tokenSecret ? signRealtimeSubscribeToken(tokenSecret, {
        rooms,
        exp: expiresAt
      }) : null,
      expiresAt
    });
  } catch (error) {
    context.error("Failed to mint wheel public session realtime token.", error);
    return errorResponse(request, config, error, "Failed to mint wheel public session realtime token.");
  }
}

export async function wheelPublicSessionSpectatorCountGet(
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
        route: "wheel_public_session_spectator_count",
        workspaceScope: "unknown"
      }
    });
    const publicSessionId = requireRouteParam(request, "publicSessionId").toLowerCase();
    const document = await getWheelPublicSession(config, publicSessionId);
    if (!document || document.ownerUserId !== actorUserId) {
      throw new HttpError(404, "Public wheel session was not found.");
    }

    const count = await getRealtimeRoomMemberCount(config, {
      room: buildWheelPublicSessionRealtimeRoom(publicSessionId),
      logger: context
    });

    return jsonResponse(request, config, 200, {
      publicSessionId,
      spectatorCount: Math.max(0, Number(count ?? 0) || 0)
    });
  } catch (error) {
    context.error("Failed to load wheel public session spectator count.", error);
    return errorResponse(request, config, error, "Failed to load wheel public session spectator count.");
  }
}
