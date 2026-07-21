import { fetchWithRetry } from "../common/shared.ts";
import { buildSessionHeaders } from "../../../auth/index.ts";
import type { SyncPayload } from "./sync-payload.ts";
import type { SyncSnapshotDto } from "./sync-contracts.ts";

export interface SyncPullResponseBody {
  snapshot?: Partial<SyncSnapshotDto>;
}

export interface SyncPushResponseBody {
  version?: unknown;
}

export async function requestCloudSyncPull(
  baseUrl: string,
  workspaceId?: string
): Promise<Response> {
  const requestUrl = `${baseUrl}/sync/pull`;
  return fetchWithRetry(requestUrl, {
    method: "POST",
    headers: buildSessionHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(workspaceId ? { workspaceId } : {})
  });
}

export async function requestCloudSyncPush(
  baseUrl: string,
  payload: SyncPayload
): Promise<Response> {
  const requestUrl = `${baseUrl}/sync/push`;
  return fetchWithRetry(requestUrl, {
    method: "POST",
    headers: buildSessionHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
}
