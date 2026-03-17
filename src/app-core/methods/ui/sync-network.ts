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
  return fetchWithRetry(`${baseUrl}/sync/pull`, {
    method: "POST",
    headers: buildAuthenticatedHeaders(authMode, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(workspaceId ? { workspaceId } : {})
  });
}

export async function requestCloudSyncPush(
  baseUrl: string,
  payload: SyncPayload,
  authMode: FrontendAuthMode = "session-preferred"
): Promise<Response> {
  return fetchWithRetry(`${baseUrl}/sync/push`, {
    method: "POST",
    headers: buildAuthenticatedHeaders(authMode, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
}
