import { resolveWorkspaceScopeContext } from "../workspace-scope.ts";
import {
  canUseAuthoritativeSalesLiveApi,
  getScopeQuery,
  requestJson,
  type SalesLiveApiApp
} from "./entity-api-shared.ts";

type RealtimeTokenResponse = {
  room?: unknown;
  rooms?: unknown;
  token?: unknown;
  expiresAt?: unknown;
};

export type WorkspaceRealtimeSubscribeToken = {
  room: string;
  rooms: string[];
  token: string | null;
  expiresAt: number | null;
};

function normalizeRealtimeSubscribeToken(body: RealtimeTokenResponse | null): WorkspaceRealtimeSubscribeToken | null {
  const room = String(body?.room ?? "").trim();
  if (!room) return null;
  const rooms = Array.isArray(body?.rooms)
    ? body?.rooms.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [room];

  const rawToken = String(body?.token ?? "").trim();
  const expiresAt = Number(body?.expiresAt);
  return {
    room,
    rooms,
    token: rawToken || null,
    expiresAt: Number.isFinite(expiresAt) ? Math.floor(expiresAt) : null
  };
}

export async function fetchWorkspaceRealtimeSubscribeToken(
  app: SalesLiveApiApp,
  lotId: number
): Promise<WorkspaceRealtimeSubscribeToken | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;
  const scope = resolveWorkspaceScopeContext(app);
  if (!scope.isWorkspace) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/realtime-token${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to create realtime subscribe token.",
    {
      expireAuthOn401: false
    }
  ) as RealtimeTokenResponse | null;

  return normalizeRealtimeSubscribeToken(body);
}

export async function fetchWorkspacePresenceRealtimeSubscribeToken(
  app: SalesLiveApiApp
): Promise<WorkspaceRealtimeSubscribeToken | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;
  const scope = resolveWorkspaceScopeContext(app);
  if (!scope.isWorkspace || !scope.workspaceId) return null;

  const body = await requestJson(
    app,
    `/workspaces/${encodeURIComponent(scope.workspaceId)}/realtime-token`,
    {
      method: "GET"
    },
    "Failed to create workspace realtime subscribe token.",
    {
      expireAuthOn401: false
    }
  ) as RealtimeTokenResponse | null;

  return normalizeRealtimeSubscribeToken(body);
}
