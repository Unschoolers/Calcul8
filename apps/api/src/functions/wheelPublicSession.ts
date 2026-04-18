import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import {
    createWheelPublicSession,
    getWheelPublicSession,
    updateWheelPublicSession
} from "../lib/cosmos/wheelPublicSessionRepository";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import {
    buildWheelPublicSessionRealtimeRoom,
    publishWheelPublicSessionRealtimeEventBestEffort,
    signRealtimeSubscribeToken
} from "../lib/realtime";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../lib/syncScopeResolution";
import type {
    WheelPublicSessionChaseEntry,
    WheelPublicSessionChaseHistoryEntry,
    WheelPublicSessionFairnessEntry,
    WheelPublicSessionSlot,
    WheelPublicSessionSnapshot,
    WheelPublicSessionStatus,
    WheelSpectatorHeatLevel
} from "../types";
import {
    readRequestJsonOrThrow,
    requireRequestBodyRecord,
    requireRouteParam
} from "./request-function-helpers";

function buildRealtimeTokenExpiryEpochSeconds(ttlSeconds = 60): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

function sanitizeWheelPublicSessionStatus(value: unknown): WheelPublicSessionStatus {
  if (value === "live" || value === "ended") return value;
  return "starting";
}

function sanitizeWheelSpectatorHeatLevel(value: unknown): WheelSpectatorHeatLevel | null {
  if (value === "low" || value === "medium" || value === "high") return value;
  return null;
}

function sanitizeFairnessEntry(value: unknown): WheelPublicSessionFairnessEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const spinNumber = Math.max(0, Math.floor(Number(candidate.spinNumber) || 0));
  const label = String(candidate.label ?? "").slice(0, 160).trim();
  const color = String(candidate.color ?? "").slice(0, 40).trim() || "#d4af37";
  const timestamp = Math.max(0, Math.floor(Number(candidate.timestamp) || 0));
  const verificationUrl = String(candidate.verificationUrl ?? "").slice(0, 512).trim();
  if (!label) return null;
  return {
    spinNumber,
    label,
    color,
    verificationUrl: verificationUrl || undefined,
    timestamp
  };
}

function sanitizeChaseHistoryEntry(value: unknown): WheelPublicSessionChaseHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const tierId = String(candidate.tierId ?? "").slice(0, 120).trim();
  const label = String(candidate.label ?? "").slice(0, 160).trim();
  const color = String(candidate.color ?? "").slice(0, 40).trim() || "#d4af37";
  const count = Math.max(0, Math.floor(Number(candidate.count) || 0));
  if (!label) return null;
  return {
    tierId,
    label,
    color,
    count
  };
}

function sanitizeChaseBoardEntry(value: unknown): WheelPublicSessionChaseEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const tierId = String(candidate.tierId ?? "").slice(0, 120).trim();
  const label = String(candidate.label ?? "").slice(0, 160).trim();
  const color = String(candidate.color ?? "").slice(0, 40).trim() || "#d4af37";
  const status = candidate.status === "claimed" ? "claimed" : "live";
  const hitCount = Math.max(0, Math.floor(Number(candidate.hitCount) || 0));
  const slots = Math.max(0, Math.floor(Number(candidate.slots) || 0));
  const remainingHitsRaw = candidate.remainingHits;
  const remainingHits = remainingHitsRaw == null
    ? null
    : Math.max(0, Math.floor(Number(remainingHitsRaw) || 0));
  if (!label) return null;
  return {
    tierId,
    label,
    color,
    status,
    hitCount,
    slots,
    remainingHits,
    isFeatured: candidate.isFeatured === true
  };
}

function sanitizeWheelSlot(value: unknown): WheelPublicSessionSlot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.name ?? "").slice(0, 160).trim();
  const color = String(candidate.color ?? "").slice(0, 40).trim() || "#d4af37";
  const tier = String(candidate.tier ?? "").slice(0, 120).trim();
  if (!name || !tier) return null;
  return {
    name,
    color,
    tier,
    isChase: candidate.isChase === true
  };
}

function sanitizeWheelPublicSessionSnapshot(value: unknown): WheelPublicSessionSnapshot {
  const candidate = requireRequestBodyRecord(value, "Field 'snapshot' must be an object.");
  return {
    wheelName: String(candidate.wheelName ?? "").slice(0, 120).trim() || "Wheel Session",
    sessionStatus: sanitizeWheelPublicSessionStatus(candidate.sessionStatus),
    totalSpins: Math.max(0, Math.floor(Number(candidate.totalSpins) || 0)),
    lastResultLabel: String(candidate.lastResultLabel ?? "").slice(0, 160).trim(),
    lastResultColor: String(candidate.lastResultColor ?? "").slice(0, 40).trim() || "#d4af37",
    wheelCurrentAngle: Number.isFinite(Number(candidate.wheelCurrentAngle)) ? Number(candidate.wheelCurrentAngle) : 0,
    wheelSlots: Array.isArray(candidate.wheelSlots)
      ? candidate.wheelSlots
        .map((entry) => sanitizeWheelSlot(entry))
        .filter((entry): entry is WheelPublicSessionSlot => entry != null)
        .slice(0, 256)
      : [],
    recentFairnessHistory: Array.isArray(candidate.recentFairnessHistory)
      ? candidate.recentFairnessHistory
        .map((entry) => sanitizeFairnessEntry(entry))
        .filter((entry): entry is WheelPublicSessionFairnessEntry => entry != null)
        .slice(0, 10)
      : [],
    chaseHistory: Array.isArray(candidate.chaseHistory)
      ? candidate.chaseHistory
        .map((entry) => sanitizeChaseHistoryEntry(entry))
        .filter((entry): entry is WheelPublicSessionChaseHistoryEntry => entry != null)
        .slice(0, 20)
      : [],
    chaseBoard: Array.isArray(candidate.chaseBoard)
      ? candidate.chaseBoard
        .map((entry) => sanitizeChaseBoardEntry(entry))
        .filter((entry): entry is WheelPublicSessionChaseEntry => entry != null)
        .slice(0, 24)
      : [],
    featuredChaseLabel: String(candidate.featuredChaseLabel ?? "").slice(0, 160).trim() || null,
    featuredChaseHeat: sanitizeWheelSpectatorHeatLevel(candidate.featuredChaseHeat),
    fairnessVerificationUrl: String(candidate.fairnessVerificationUrl ?? "").slice(0, 512).trim() || null,
    updatedAt: Math.max(0, Math.floor(Number(candidate.updatedAt) || Date.now()))
  };
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
      snapshot: document.snapshot
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
    publishWheelPublicSessionRealtimeEventBestEffort(config, {
      publicSessionId: updated.publicSessionId,
      eventType: "wheel.public-session.updated",
      data: {
        publicSessionId: updated.publicSessionId,
        snapshot: updated.snapshot
      },
      logger: context
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      publicSessionId: updated.publicSessionId,
      snapshot: updated.snapshot
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
      snapshot: document.snapshot
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

app.http("wheelPublicSessionCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session",
  handler: wheelPublicSessionCreate
});

app.http("wheelPublicSessionPublish", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/publish",
  handler: wheelPublicSessionPublish
});

app.http("wheelPublicSessionGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/{publicSessionId}",
  handler: wheelPublicSessionGet
});

app.http("wheelPublicSessionRealtimeTokenGet", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/public-session/{publicSessionId}/realtime-token",
  handler: wheelPublicSessionRealtimeTokenGet
});
