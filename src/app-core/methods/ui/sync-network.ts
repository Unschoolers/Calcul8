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

export async function requestCloudSyncPull(baseUrl: string, googleIdToken: string): Promise<Response> {
  return fetchWithRetry(`${baseUrl}/sync/pull`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${googleIdToken}`
    }
  });
}

export async function requestCloudSyncPush(
  baseUrl: string,
  googleIdToken: string,
  payload: SyncPayload
): Promise<Response> {
  return fetchWithRetry(`${baseUrl}/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${googleIdToken}`
    },
    body: JSON.stringify(payload)
  });
}
