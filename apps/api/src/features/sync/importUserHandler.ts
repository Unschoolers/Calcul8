import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { setSyncScopeEntityModes } from "../../lib/cosmos/salesRepository";
import { hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import {
  getEffectiveSyncSnapshot,
  getEffectiveSyncSnapshotFromExternalSource,
  getSyncMetaDocumentFromExternalSource,
  getSyncScopeEntityDocumentsFromExternalSource,
  replaceSyncScopeEntityDocuments,
  upsertSyncSnapshotIncremental
} from "../../lib/cosmos/syncSnapshotRepository";
import { syncSnapshotId } from "../../lib/cosmos/ids";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../../lib/syncScopeResolution";
import type { ApiConfig } from "../../types";
import { executeHttpHandler, jsonResponse } from "../../lib/http";

const SYNC_IMPORT_ADMIN_USER_ID = "107850224060485991888";

function parseImportUserPayload(payload: unknown): {
  sourceUserId: string;
  sourceWorkspaceId?: string;
  workspaceId?: string;
} {
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

  return {
    sourceUserId,
    sourceWorkspaceId: parseOptionalWorkspaceId(
      (payload as { sourceWorkspaceId?: unknown }).sourceWorkspaceId,
      "sourceWorkspaceId"
    ),
    workspaceId: parseOptionalWorkspaceId((payload as { workspaceId?: unknown }).workspaceId)
  };
}

function resolveSourceScopeKey(sourceUserId: string, sourceWorkspaceId: string | undefined): string {
  if (!sourceWorkspaceId) return sourceUserId;
  return resolveSyncScope(sourceUserId, sourceWorkspaceId).partitionKey;
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
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /ops/sync/import-user failed",
    fallbackErrorMessage: "Failed to import sync data from source user.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    if (actorUserId !== SYNC_IMPORT_ADMIN_USER_ID) {
      throw new HttpError(403, "Forbidden.");
    }

    const { sourceUserId, sourceWorkspaceId, workspaceId } = parseImportUserPayload(await request.json());
    const targetScope = resolveSyncScope(actorUserId, workspaceId);
    await assertSyncScopeAccess(
      targetScope,
      (scopeActorUserId, scopeWorkspaceId) => hasWorkspaceMembership(config, scopeActorUserId, scopeWorkspaceId)
    );

    const sourceConfig = resolveSourceSyncConfig(config);
    const sourceScopeKey = resolveSourceScopeKey(sourceUserId, sourceWorkspaceId);
    const sourceSnapshot = await getEffectiveSyncSnapshotFromExternalSource(
      sourceConfig,
      sourceScopeKey
    );
    if (!sourceSnapshot) {
      throw new HttpError(404, "Source sync snapshot was not found.");
    }
    const [sourceMeta, sourceEntityDocuments] = await Promise.all([
      getSyncMetaDocumentFromExternalSource(sourceConfig, sourceScopeKey),
      getSyncScopeEntityDocumentsFromExternalSource(sourceConfig, sourceScopeKey)
    ]);

    const targetScopeKey = targetScope.partitionKey;
    const actorSnapshot = await getEffectiveSyncSnapshot(config, targetScopeKey);
    const sourceVersion = Number.isFinite(sourceSnapshot.version) ? Math.floor(sourceSnapshot.version) : 0;
    const actorVersion = Number.isFinite(actorSnapshot?.version) ? Math.floor(actorSnapshot!.version) : 0;
    const nextVersion = Math.max(sourceVersion + 1, actorVersion + 1);
    const updatedAt = new Date().toISOString();
    const importedSnapshot = {
      id: syncSnapshotId(targetScopeKey),
      userId: targetScopeKey,
      lots: sourceSnapshot.lots,
      salesByLot: sourceSnapshot.salesByLot,
      systemPricingDefaults: sourceSnapshot.systemPricingDefaults ?? null,
      wheelConfigs: Array.isArray(sourceSnapshot.wheelConfigs) ? sourceSnapshot.wheelConfigs : [],
      activeWheelConfigId: typeof sourceSnapshot.activeWheelConfigId === "number"
        ? sourceSnapshot.activeWheelConfigId
        : null,
      version: nextVersion,
      updatedAt
    };

    const writeResult = await upsertSyncSnapshotIncremental(config, {
      userId: targetScopeKey,
      lots: importedSnapshot.lots,
      salesByLot: importedSnapshot.salesByLot,
      systemPricingDefaults: importedSnapshot.systemPricingDefaults,
      wheelConfigs: importedSnapshot.wheelConfigs,
      activeWheelConfigId: importedSnapshot.activeWheelConfigId,
      version: nextVersion,
      updatedAt
    });
    const entityWriteResult = await replaceSyncScopeEntityDocuments(config, {
      scopeKey: targetScopeKey,
      saleDocuments: sourceEntityDocuments.saleDocuments,
      livePricingDocuments: sourceEntityDocuments.livePricingDocuments
    });
    await setSyncScopeEntityModes(config, {
      scopeKey: targetScopeKey,
      updatedAt,
      salesMode: sourceMeta?.salesMode === "entity" ? "entity" : "snapshot",
      livePricingMode: sourceMeta?.livePricingMode === "entity" ? "entity" : "lot_defaults"
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      actorUserId,
      sourceUserId,
      sourceWorkspaceId: sourceWorkspaceId ?? null,
      sourceScopeKey,
      workspaceId: targetScope.scopeType === "workspace" ? targetScope.scopeId : null,
      targetScopeKey,
      sourceVersion,
      sourceLotsCount: Array.isArray(sourceSnapshot.lots) ? sourceSnapshot.lots.length : 0,
      sourceSystemPricingDefaultsPresent: Boolean(sourceSnapshot.systemPricingDefaults),
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
      livePricingMode: sourceMeta?.livePricingMode === "entity" ? "entity" : "lot_defaults",
      snapshot: importedSnapshot
    });
    }
  });
}
