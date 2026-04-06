import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { publishWorkspaceWheelRealtimeEventBestEffort } from "../lib/realtime";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../lib/syncScopeResolution";
import { readRequestJsonOrThrow, requireRequestBodyRecord } from "./request-function-helpers";

function parseWheelBroadcastBody(rawBody: unknown): {
  workspaceId: string;
  session: Record<string, unknown>;
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
    session: body.session as Record<string, unknown>
  };
}

function sanitizeWheelSession(session: Record<string, unknown>): Record<string, unknown> {
  const fairnessHistory = Array.isArray(session.wheelFairnessHistory)
    ? session.wheelFairnessHistory
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .slice(-20)
      .map((entry) => ({
        spinNumber: Math.max(0, Math.floor(Number((entry as Record<string, unknown>).spinNumber) || 0)),
        label: String((entry as Record<string, unknown>).label ?? "").slice(0, 160),
        color: String((entry as Record<string, unknown>).color ?? "").slice(0, 40),
        hash: String((entry as Record<string, unknown>).hash ?? "").slice(0, 256),
        seed: String((entry as Record<string, unknown>).seed ?? "").slice(0, 256),
        clientSeed: String((entry as Record<string, unknown>).clientSeed ?? "").slice(0, 256),
        verificationUrl: String((entry as Record<string, unknown>).verificationUrl ?? "").slice(0, 512),
        algorithm: String((entry as Record<string, unknown>).algorithm ?? "").slice(0, 80),
        timestamp: Math.max(0, Math.floor(Number((entry as Record<string, unknown>).timestamp) || 0))
      }))
    : [];

  return {
    wheelConfigs: Array.isArray(session.wheelConfigs)
      ? session.wheelConfigs.slice(0, 100)
      : [],
    activeWheelConfigId: session.activeWheelConfigId == null
      ? null
      : (Number(session.activeWheelConfigId) || null),
    wheelTotalSpins: Math.max(0, Math.floor(Number(session.wheelTotalSpins) || 0)),
    wheelSpinCounts: Array.isArray(session.wheelSpinCounts)
      ? session.wheelSpinCounts.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
      : [],
    wheelSessionNetRevenue: Number.isFinite(Number(session.wheelSessionNetRevenue))
      ? (Number(session.wheelSessionNetRevenue) || 0)
      : null,
    wheelSessionCostAdjustment: Number.isFinite(Number(session.wheelSessionCostAdjustment))
      ? (Number(session.wheelSessionCostAdjustment) || 0)
      : 0,
    wheelFairnessHistory: fairnessHistory,
    wheelChaseTallyHistory: Array.isArray(session.wheelChaseTallyHistory)
      ? session.wheelChaseTallyHistory
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, 200)
        .map((entry) => ({
          tierId: String((entry as Record<string, unknown>).tierId ?? "").slice(0, 120),
          label: String((entry as Record<string, unknown>).label ?? "").slice(0, 160),
          color: String((entry as Record<string, unknown>).color ?? "").slice(0, 40),
          count: Math.max(0, Math.floor(Number((entry as Record<string, unknown>).count) || 0))
        }))
      : [],
    wheelCurrentAngle: Number.isFinite(Number(session.wheelCurrentAngle))
      ? (Number(session.wheelCurrentAngle) || 0)
      : 0,
    wheelLastResult: String(session.wheelLastResult ?? "").slice(0, 200),
    wheelLastResultColor: String(session.wheelLastResultColor ?? "").slice(0, 80),
    wheelSessionUpdatedAt: Math.max(0, Math.floor(Number(session.wheelSessionUpdatedAt) || Date.now())),
    wheelPendingInventoryIssues: Array.isArray(session.wheelPendingInventoryIssues)
      ? session.wheelPendingInventoryIssues.slice(0, 500)
      : [],
    wheelSkippedDeductions: Array.isArray(session.wheelSkippedDeductions)
      ? session.wheelSkippedDeductions.slice(0, 500)
      : []
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
      data: sanitizeWheelSession(body.session),
      logger: context
    });

    return jsonResponse(request, config, 200, { ok: true });
  } catch (error) {
    context.error("Failed to broadcast wheel session.", error);
    return errorResponse(request, config, error, "Failed to broadcast wheel session.");
  }
}

app.http("wheelBroadcast", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/broadcast",
  handler: wheelBroadcast
});
