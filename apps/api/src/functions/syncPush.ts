import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../lib/auth";
import { getEffectiveSyncSnapshot, upsertSyncSnapshotIncremental } from "../lib/cosmos/syncSnapshotRepository";
import { getConfig } from "../lib/config";
import { jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { publishWorkspaceLotRealtimeEvent } from "../lib/realtime";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { parseSyncLotsShape } from "../lib/syncShape";
import { assertSafeSyncPush } from "../lib/syncSafety";
import { handleSyncFunctionError, isRecord, resolveAuthorizedSyncScope } from "./sync-function-helpers";
import type { SyncPushPayload } from "../types";

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

function parseOptionalActiveLotId(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
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
    activeLotId: parseOptionalActiveLotId(payload.activeLotId),
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
    const payload = await parseSyncPushPayload(request);
    workspaceId = payload.workspaceId;
    const { userId, syncScope } = await resolveAuthorizedSyncScope({
      request,
      context,
      config,
      route: "sync_push",
      workspaceId: payload.workspaceId
    });

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

    if (workspaceId && payload.activeLotId != null) {
      await publishWorkspaceLotRealtimeEvent(config, {
        workspaceId,
        lotId: String(payload.activeLotId),
        eventType: "lot.config.updated",
        data: {
          lotId: String(payload.activeLotId),
          version,
          updatedAt
        },
        logger: context
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
    return handleSyncFunctionError({
      request,
      context,
      config,
      route: "sync_push",
      workspaceId,
      error,
      failureMessage: "Failed to save cloud sync data.",
      logMessage: "POST /sync/push failed"
    });
  }
}

app.http("syncPush", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sync/push",
  handler: syncPush
});
