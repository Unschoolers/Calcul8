import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { getConfig } from "../../lib/config";
import { jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import {
  assertAuthorizedSyncScopeStillActive,
  handleSyncFunctionError,
  isRecord,
  resolveAuthorizedSyncScope
} from "./helpers";
import type { SyncPullPayload } from "../../types";

const EMPTY_SYNC_SNAPSHOT = {
  lots: [],
  salesByLot: {},
  wheelConfigs: [],
  activeWheelConfigId: null,
  version: 0,
  updatedAt: null
};

async function parseSyncPullPayload(request: HttpRequest): Promise<SyncPullPayload> {
  if (typeof request.json !== "function") {
    return {};
  }

  try {
    const payload = await request.json();
    if (!isRecord(payload)) return {};
    return {
      workspaceId: parseOptionalWorkspaceId(payload.workspaceId)
    };
  } catch {
    return {};
  }
}

export async function syncPull(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  let workspaceId: string | undefined;
  const guardResponse = await maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const payload = await parseSyncPullPayload(request);
    workspaceId = payload.workspaceId;
    const { userId, syncScope } = await resolveAuthorizedSyncScope({
      request,
      context,
      config,
      route: "sync_pull",
      workspaceId: payload.workspaceId
    });
    const snapshot = await getEffectiveSyncSnapshot(config, syncScope.partitionKey);
    await assertAuthorizedSyncScopeStillActive(config, syncScope);

    return jsonResponse(request, config, 200, {
      userId,
      snapshot: snapshot ?? EMPTY_SYNC_SNAPSHOT
    });
  } catch (error) {
    return handleSyncFunctionError({
      request,
      context,
      config,
      route: "sync_pull",
      workspaceId,
      error,
      failureMessage: "Failed to load cloud sync data.",
      logMessage: "POST /sync/pull failed"
    });
  }
}
