import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { getConfig } from "../../lib/config";
import {
    createGamePublicSession,
    GamePublicSessionConflictError,
    getGamePublicSession,
    updateGamePublicSession
} from "../../lib/cosmos/gamePublicSessionRepository";
import { hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import {
    buildGamePublicSessionRealtimeRoom,
    getRealtimeRoomMemberCountStatus,
    publishGamePublicSessionRealtimeEventBestEffort,
    signRealtimeSubscribeToken
} from "../../lib/realtime";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../../lib/syncScopeResolution";
import type { GamePublicSessionSnapshot } from "../../types";
import { normalizeGamePublicSessionSnapshot } from "../../shared/game-public-session-contracts.cjs";
import {
    readRequestJsonOrThrow,
    requireRequestBodyRecord,
    requireRouteParam
} from "../../lib/httpRequest";

function buildRealtimeTokenExpiryEpochSeconds(ttlSeconds = 60): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

function sanitizeGamePublicSessionSnapshot(value: unknown): GamePublicSessionSnapshot {
  const snapshot = normalizeGamePublicSessionSnapshot(value);
  if (!snapshot) {
    requireRequestBodyRecord(value, "Field 'snapshot' must be an object.");
    throw new HttpError(400, "Field 'snapshot' must be an object.");
  }
  return snapshot;
}

function parseCreateBody(rawBody: unknown): {
  workspaceId?: string;
  snapshot: GamePublicSessionSnapshot;
} {
  const body = requireRequestBodyRecord(rawBody);
  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    snapshot: sanitizeGamePublicSessionSnapshot(body.snapshot)
  };
}

function parsePublishBody(rawBody: unknown): {
  publicSessionId: string;
  snapshot: GamePublicSessionSnapshot;
} {
  const body = requireRequestBodyRecord(rawBody);
  const publicSessionId = String(body.publicSessionId ?? "").trim().toLowerCase();
  if (!publicSessionId) {
    throw new HttpError(400, "Field 'publicSessionId' is required.");
  }
  return {
    publicSessionId,
    snapshot: sanitizeGamePublicSessionSnapshot(body.snapshot)
  };
}

function normalizePublicSessionPublishError(error: unknown): unknown {
  const isPublicSessionConflict = error instanceof GamePublicSessionConflictError
    || (
      error instanceof Error
      && error.name === "GamePublicSessionConflictError"
    );
  if (!isPublicSessionConflict) return error;
  return new HttpError(
    409,
    error instanceof Error ? error.message : "Public game session changed since it was last published."
  );
}

export async function gamePublicSessionCreate(
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
        route: "game_public_session_create",
        workspaceScope: "unknown"
      }
    });
    const body = parseCreateBody(await readRequestJsonOrThrow(request));
    const syncScope = resolveSyncScope(actorUserId, body.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, workspaceId) => hasWorkspaceMembership(config, userId, workspaceId)
    );

    const document = await createGamePublicSession(config, {
      ownerUserId: actorUserId,
      scopeType: syncScope.scopeType,
      scopeId: syncScope.scopeId,
      workspaceId: syncScope.scopeType === "workspace" ? syncScope.scopeId : null,
      snapshot: body.snapshot
    });

    return jsonResponse(request, config, 200, {
      publicSessionId: document.publicSessionId,
      snapshot: sanitizeGamePublicSessionSnapshot(document.snapshot)
    });
  } catch (error) {
    context.error("Failed to create game public session.", error);
    return errorResponse(request, config, error, "Failed to create game public session.");
  }
}

export async function gamePublicSessionPublish(
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
        route: "game_public_session_publish",
        workspaceScope: "unknown"
      }
    });
    const body = parsePublishBody(await readRequestJsonOrThrow(request));
    const updated = await updateGamePublicSession(config, {
      publicSessionId: body.publicSessionId,
      ownerUserId: actorUserId,
      snapshot: body.snapshot
    });
    if (!updated) {
      throw new HttpError(404, "Public game session was not found.");
    }
    const snapshot = sanitizeGamePublicSessionSnapshot(updated.snapshot);
    publishGamePublicSessionRealtimeEventBestEffort(config, {
      publicSessionId: updated.publicSessionId,
      eventType: "game.public-session.updated",
      data: {
        publicSessionId: updated.publicSessionId,
        snapshot
      },
      logger: context
    });
    publishGamePublicSessionRealtimeEventBestEffort(config, {
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
    const handledError = normalizePublicSessionPublishError(error);
    context.error("Failed to publish game public session.", handledError);
    return errorResponse(request, config, handledError, "Failed to publish game public session.");
  }
}

export async function gamePublicSessionGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const publicSessionId = requireRouteParam(request, "publicSessionId").toLowerCase();
    const document = await getGamePublicSession(config, publicSessionId);
    if (!document) {
      throw new HttpError(404, "Public game session was not found.");
    }

    return jsonResponse(request, config, 200, {
      publicSessionId: document.publicSessionId,
      snapshot: sanitizeGamePublicSessionSnapshot(document.snapshot)
    });
  } catch (error) {
    context.error("Failed to load game public session.", error);
    return errorResponse(request, config, error, "Failed to load game public session.");
  }
}

export async function gamePublicSessionRealtimeTokenGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const publicSessionId = requireRouteParam(request, "publicSessionId").toLowerCase();
    const document = await getGamePublicSession(config, publicSessionId);
    if (!document) {
      throw new HttpError(404, "Public game session was not found.");
    }

    const room = buildGamePublicSessionRealtimeRoom(publicSessionId);
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
    context.error("Failed to mint game public session realtime token.", error);
    return errorResponse(request, config, error, "Failed to mint game public session realtime token.");
  }
}

export async function gamePublicSessionSpectatorCountGet(
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
        route: "game_public_session_spectator_count",
        workspaceScope: "unknown"
      }
    });
    const publicSessionId = requireRouteParam(request, "publicSessionId").toLowerCase();
    const document = await getGamePublicSession(config, publicSessionId);
    if (!document || document.ownerUserId !== actorUserId) {
      throw new HttpError(404, "Public game session was not found.");
    }

    const room = buildGamePublicSessionRealtimeRoom(publicSessionId);
    const countStatus = await getRealtimeRoomMemberCountStatus(config, {
      room,
      logger: context
    });
    const countAvailable = countStatus.available;

    return jsonResponse(request, config, 200, {
      publicSessionId,
      room,
      countAvailable,
      spectatorCount: countStatus.available ? countStatus.count : 0,
      ...(countStatus.available ? {} : {
        countUnavailableReason: countStatus.reason,
        ...(typeof countStatus.status === "number" ? { countHttpStatus: countStatus.status } : {})
      })
    });
  } catch (error) {
    context.error("Failed to load game public session spectator count.", error);
    return errorResponse(request, config, error, "Failed to load game public session spectator count.");
  }
}
