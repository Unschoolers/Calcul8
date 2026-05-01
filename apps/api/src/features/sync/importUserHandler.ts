import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { setSyncScopeEntityModes } from "../../lib/cosmos/salesRepository";
import {
  getEffectiveSyncSnapshot,
  getEffectiveSyncSnapshotFromExternalSource,
  getSyncMetaDocumentFromExternalSource,
  getSyncScopeEntityDocumentsFromExternalSource,
  replaceSyncScopeEntityDocuments,
  upsertSyncSnapshotIncremental
} from "../../lib/cosmos/syncSnapshotRepository";
import { getConfig } from "../../lib/config";
import type { ApiConfig } from "../../types";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";

const SYNC_IMPORT_ADMIN_USER_ID = "107850224060485991888";

function parseSourceUserId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const sourceUserId = String((payload as { sourceUserId?: unknown }).sourceUserId ?? "").trim();
  if (!sourceUserId) {
    throw new HttpError(400, "Field 'sourceUserId' is required.");
  }
  if (!/^[A-Za-z0-9._:@-]{6,128}$/.test(sourceUserId)) {
    throw new HttpError(400, "Field 'sourceUserId' has an invalid format.");
  }

  return sourceUserId;
}

function resolveSourceSyncConfig(config: ApiConfig): {
  endpoint: string;
  key: string;
  databaseId: string;
  syncContainerId: string;
} {
  return {
    endpoint: String(config.syncImportSourceCosmosEndpoint || config.cosmosEndpoint).trim(),
    key: String(config.syncImportSourceCosmosKey || config.cosmosKey).trim(),
    databaseId: String(config.syncImportSourceCosmosDatabaseId || config.cosmosDatabaseId).trim(),
    syncContainerId: String(config.syncImportSourceSyncContainerId || config.syncContainerId).trim()
  };
}

export async function syncImportUser(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config);
    if (actorUserId !== SYNC_IMPORT_ADMIN_USER_ID) {
      throw new HttpError(403, "Forbidden.");
    }

    const sourceUserId = parseSourceUserId(await request.json());
    const sourceConfig = resolveSourceSyncConfig(config);
    const sourceSnapshot = await getEffectiveSyncSnapshotFromExternalSource(
      sourceConfig,
      sourceUserId
    );
    if (!sourceSnapshot) {
      throw new HttpError(404, "Source sync snapshot was not found.");
    }
    const [sourceMeta, sourceEntityDocuments] = await Promise.all([
      getSyncMetaDocumentFromExternalSource(sourceConfig, sourceUserId),
      getSyncScopeEntityDocumentsFromExternalSource(sourceConfig, sourceUserId)
    ]);

    const actorSnapshot = await getEffectiveSyncSnapshot(config, actorUserId);
    const sourceVersion = Number.isFinite(sourceSnapshot.version) ? Math.floor(sourceSnapshot.version) : 0;
    const actorVersion = Number.isFinite(actorSnapshot?.version) ? Math.floor(actorSnapshot!.version) : 0;
    const nextVersion = Math.max(sourceVersion + 1, actorVersion + 1);
    const updatedAt = new Date().toISOString();

    const writeResult = await upsertSyncSnapshotIncremental(config, {
      userId: actorUserId,
      lots: sourceSnapshot.lots,
      salesByLot: sourceSnapshot.salesByLot,
      wheelConfigs: Array.isArray(sourceSnapshot.wheelConfigs) ? sourceSnapshot.wheelConfigs : [],
      activeWheelConfigId: typeof sourceSnapshot.activeWheelConfigId === "number"
        ? sourceSnapshot.activeWheelConfigId
        : null,
      version: nextVersion,
      updatedAt
    });
    const entityWriteResult = await replaceSyncScopeEntityDocuments(config, {
      scopeKey: actorUserId,
      saleDocuments: sourceEntityDocuments.saleDocuments,
      livePricingDocuments: sourceEntityDocuments.livePricingDocuments
    });
    await setSyncScopeEntityModes(config, {
      scopeKey: actorUserId,
      updatedAt,
      salesMode: sourceMeta?.salesMode === "entity" ? "entity" : "snapshot",
      livePricingMode: sourceMeta?.livePricingMode === "entity" ? "entity" : "lot_defaults"
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      actorUserId,
      sourceUserId,
      sourceVersion,
      sourceWheelConfigsCount: Array.isArray(sourceSnapshot.wheelConfigs)
        ? sourceSnapshot.wheelConfigs.length
        : 0,
      sourceActiveWheelConfigId: typeof sourceSnapshot.activeWheelConfigId === "number"
        ? sourceSnapshot.activeWheelConfigId
        : null,
      version: nextVersion,
      changed: writeResult.changed,
      upsertedCount: writeResult.upsertedCount,
      deletedCount: writeResult.deletedCount,
      entityUpsertedCount: entityWriteResult.upsertedCount,
      entityDeletedCount: entityWriteResult.deletedCount,
      salesMode: sourceMeta?.salesMode === "entity" ? "entity" : "snapshot",
      livePricingMode: sourceMeta?.livePricingMode === "entity" ? "entity" : "lot_defaults"
    });
  } catch (error) {
    context.error("POST /ops/sync/import-user failed", error);
    return errorResponse(request, config, error, "Failed to import sync data from source user.");
  }
}