import { fetchWithRetry } from "./shared.ts";
import { buildAuthenticatedHeaders, type FrontendAuthMode } from "../../auth/index.ts";
import type { SyncPayload } from "./sync-payload.ts";

export interface SyncPullResponseBody {
  snapshot?: {
    lots?: unknown[];
    salesByLot?: Record<string, unknown[]>;
    version?: number;
    updatedAt?: string | null;
  };
}

export interface SyncPushResponseBody {
  version?: unknown;
}

export async function requestCloudSyncPull(
  baseUrl: string,
  workspaceId?: string,
  authMode: FrontendAuthMode = "session-preferred"
): Promise<Response> {
  const requestUrl = `${baseUrl}/sync/pull`;
  return fetchWithRetry(requestUrl, {
    method: "POST",
    headers: buildAuthenticatedHeaders(authMode, {
      "Content-Type": "application/json"
    }, requestUrl),
    body: JSON.stringify(workspaceId ? { workspaceId } : {})
  });
}

export async function requestCloudSyncPush(
  baseUrl: string,
  payload: SyncPayload,
  authMode: FrontendAuthMode = "session-preferred"
): Promise<Response> {
  const requestUrl = `${baseUrl}/sync/push`;
  return fetchWithRetry(requestUrl, {
    method: "POST",
    headers: buildAuthenticatedHeaders(authMode, {
      "Content-Type": "application/json"
    }, requestUrl),
    body: JSON.stringify(payload)
  });
}
