import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot, upsertSyncSnapshotIncremental } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight } from "../lib/http";
import { parseCanonicalSyncShape } from "../lib/syncShape";
import { assertSafeSyncPush } from "../lib/syncSafety";
import type { SyncPushPayload } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPresetId(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const id = value.id;
  return typeof id === "string" || typeof id === "number";
}

function parsePresetIds(presets: unknown[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const preset of presets) {
    if (!hasPresetId(preset)) {
      throw new HttpError(400, "Each lot (legacy preset) must be an object containing an 'id' field.");
    }

    const presetId = String((preset as { id: string | number }).id);
    if (seen.has(presetId)) {
      throw new HttpError(400, `Duplicate lot id '${presetId}' in payload.`);
    }
    seen.add(presetId);
    ids.push(presetId);
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

  const canonicalShape = parseCanonicalSyncShape(payload);
  const clientVersion = payload.clientVersion;

  parsePresetIds(canonicalShape.presets);

  if (clientVersion != null && (typeof clientVersion !== "number" || !Number.isFinite(clientVersion))) {
    throw new HttpError(400, "Field 'clientVersion' must be a number when provided.");
  }

  if (payload.allowEmptyOverwrite != null && typeof payload.allowEmptyOverwrite !== "boolean") {
    throw new HttpError(400, "Field 'allowEmptyOverwrite' must be a boolean when provided.");
  }

  return {
    presets: canonicalShape.presets,
    salesByPreset: canonicalShape.salesByPreset,
    clientVersion: typeof clientVersion === "number" ? clientVersion : undefined,
    allowEmptyOverwrite: payload.allowEmptyOverwrite === true
  };
}

export async function syncPush(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  try {
    const userId = await resolveUserId(request, config);
    const payload = await parseSyncPushPayload(request);
    const existingSnapshot = await getEffectiveSyncSnapshot(config, userId);
    assertSafeSyncPush(
      existingSnapshot,
      payload.presets,
      payload.salesByPreset,
      payload.allowEmptyOverwrite === true
    );

    const previousVersion = existingSnapshot?.version ?? 0;
    const candidateVersion = Math.floor(payload.clientVersion ?? 0);
    const version = Math.max(previousVersion + 1, candidateVersion + 1);
    const updatedAt = new Date().toISOString();

    const syncResult = await upsertSyncSnapshotIncremental(config, {
      userId,
      presets: payload.presets,
      salesByPreset: payload.salesByPreset,
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
