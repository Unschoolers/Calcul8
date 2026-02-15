import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getEffectiveSyncSnapshot, upsertSyncSnapshotIncremental } from "../lib/cosmos";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";
import type { SyncPushPayload } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isSalesByPreset(value: unknown): value is Record<string, unknown[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => Array.isArray(entry));
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
      throw new HttpError(400, "Each preset must be an object containing an 'id' field.");
    }

    const presetId = String((preset as { id: string | number }).id);
    if (seen.has(presetId)) {
      throw new HttpError(400, `Duplicate preset id '${presetId}' in payload.`);
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

  const presets = payload.presets;
  const salesByPreset = payload.salesByPreset;
  const clientVersion = payload.clientVersion;

  if (!isUnknownArray(presets)) {
    throw new HttpError(400, "Field 'presets' must be an array.");
  }
  parsePresetIds(presets);

  if (!isSalesByPreset(salesByPreset)) {
    throw new HttpError(400, "Field 'salesByPreset' must be an object of arrays.");
  }

  if (clientVersion != null && (typeof clientVersion !== "number" || !Number.isFinite(clientVersion))) {
    throw new HttpError(400, "Field 'clientVersion' must be a number when provided.");
  }

  return {
    presets,
    salesByPreset,
    clientVersion: typeof clientVersion === "number" ? clientVersion : undefined
  };
}

export async function syncPush(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const userId = await resolveUserId(request, config);
    const payload = await parseSyncPushPayload(request);
    const existingSnapshot = await getEffectiveSyncSnapshot(config, userId);

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
