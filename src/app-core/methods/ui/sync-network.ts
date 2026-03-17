import { fetchWithRetry } from "./shared.ts";
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
  googleIdToken?: string,
  workspaceId?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (googleIdToken && googleIdToken.trim()) {
    headers.Authorization = `Bearer ${googleIdToken.trim()}`;
  }
  return fetchWithRetry(`${baseUrl}/sync/pull`, {
    method: "POST",
    headers,
    body: JSON.stringify(workspaceId ? { workspaceId } : {})
  });
}

export async function requestCloudSyncPush(
  baseUrl: string,
  googleIdToken: string | undefined,
  payload: SyncPayload
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (googleIdToken && googleIdToken.trim()) {
    headers.Authorization = `Bearer ${googleIdToken.trim()}`;
  }
  return fetchWithRetry(`${baseUrl}/sync/push`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
}
