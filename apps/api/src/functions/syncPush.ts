import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot, hasWorkspaceMembership, upsertSyncSnapshotIncremental } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope, shouldWarnWorkspaceScopeFallback } from "../lib/syncScopeResolution";
import { parseSyncLotsShape } from "../lib/syncShape";
import { assertSafeSyncPush } from "../lib/syncSafety";
import { logApiTelemetry } from "../lib/telemetry";
import type { SyncPushPayload } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasLotId(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const id = value.id;
  return typeof id === "string" || typeof id === "number";
}

function parseLotIds(lots: unknown[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const lot of lots) {
    if (!hasLotId(lot)) {
      throw new HttpError(400, "Each lot must be an object containing an 'id' field.");
    }

    const lotId = String((lot as { id: string | number }).id);
    if (seen.has(lotId)) {
      throw new HttpError(400, `Duplicate lot id '${lotId}' in payload.`);
    }
    seen.add(lotId);
    ids.push(lotId);
  }

  return ids;
}

async function parseSyncPushPayload(request: HttpRequest): Promise<SyncPushPayload> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }

  if (!isRecord(payload)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const syncShape = parseSyncLotsShape(payload);
  const clientVersion = payload.clientVersion;
  const workspaceId = parseOptionalWorkspaceId(payload.workspaceId);

  parseLotIds(syncShape.lots);

  if (clientVersion != null && (typeof clientVersion !== "number" || !Number.isFinite(clientVersion))) {
    throw new HttpError(400, "Field 'clientVersion' must be a number when provided.");
  }

  if (payload.allowEmptyOverwrite != null && typeof payload.allowEmptyOverwrite !== "boolean") {
    throw new HttpError(400, "Field 'allowEmptyOverwrite' must be a boolean when provided.");
  }

  return {
    lots: syncShape.lots,
    salesByLot: syncShape.salesByLot,
    clientVersion: typeof clientVersion === "number" ? clientVersion : undefined,
    allowEmptyOverwrite: payload.allowEmptyOverwrite === true,
    workspaceId
  };
}

function assertSyncPushVersion(
  existingVersion: number,
  clientVersion: number | undefined
): void {
  if (clientVersion == null) return;
  if (clientVersion < existingVersion) {
    throw new HttpError(
      409,
      "Cloud data changed since your last sync. Pull latest data and retry."
    );
  }
}

export async function syncPush(
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
        route: "sync_push",
        workspaceScope: "unknown"
      }
    });
    const payload = await parseSyncPushPayload(request);
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

    const existingSnapshot = await getEffectiveSyncSnapshot(config, syncScope.partitionKey);
    const previousVersion = existingSnapshot?.version ?? 0;
    assertSyncPushVersion(previousVersion, payload.clientVersion);
    assertSafeSyncPush(
      existingSnapshot,
      payload.lots,
      payload.salesByLot,
      payload.allowEmptyOverwrite === true
    );

    const candidateVersion = Math.floor(payload.clientVersion ?? 0);
    const version = Math.max(previousVersion + 1, candidateVersion + 1);
    const updatedAt = new Date().toISOString();

    const syncResult = await upsertSyncSnapshotIncremental(config, {
      userId: syncScope.partitionKey,
      lots: payload.lots,
      salesByLot: payload.salesByLot,
      version,
      updatedAt
    });

    if (!syncResult.changed) {
      return jsonResponse(request, config, 200, {
        ok: true,
        userId,
        version: previousVersion,
        updatedAt: existingSnapshot?.updatedAt ?? null,
        changed: false
      });
    }

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      version,
      updatedAt,
      changed: true,
      upsertedCount: syncResult.upsertedCount,
      deletedCount: syncResult.deletedCount
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
    if (status === 401 || status === 403 || status === 409) {
      logApiTelemetry({
        logger: context,
        level: "warn",
        request,
        config,
        route: "sync_push",
        workspaceScope: workspaceId ? "workspace" : "personal",
        outcome: `http_${status}`
      });
    }
    context.error("POST /sync/push failed", error);
    return errorResponse(request, config, error, "Failed to save cloud sync data.");
  }
}

app.http("syncPush", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sync/push",
  handler: syncPush
});
