import type { WheelSpectatorSnapshot } from "../../../../types/app.ts";
import type { AppContext } from "../../../context-app.ts";
import type { WorkspaceRealtimeSubscribeToken } from "../../workspace-realtime-api.ts";
import { fetchAuthenticatedApiResponse } from "../common/shared.ts";
import { normalizeWheelSpectatorSnapshot } from "./wheel-spectator-contract.ts";

type WheelSpectatorCreateResponse = {
  publicSessionId?: unknown;
};

type WheelSpectatorReadResponse = {
  publicSessionId?: unknown;
  snapshot?: unknown;
};

type WheelSpectatorRealtimeTokenResponse = {
  room?: unknown;
  rooms?: unknown;
  token?: unknown;
  expiresAt?: unknown;
};

type WheelSpectatorCountResponse = {
  publicSessionId?: unknown;
  spectatorCount?: unknown;
};

export async function createWheelSpectatorSession(
  app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId" | "googleAuthEpoch" | "hasProAccess">,
  snapshot: WheelSpectatorSnapshot
): Promise<{ publicSessionId: string }> {
  const response = await fetchAuthenticatedApiResponse(app as AppContext, "/wheel/public-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workspaceId: app.activeScopeType === "workspace" ? app.activeWorkspaceId : null,
      snapshot
    })
  });

  if (!response.ok) {
    throw new Error("Failed to create spectator session.");
  }

  const body = await response.json() as WheelSpectatorCreateResponse;
  const publicSessionId = String(body.publicSessionId ?? "").trim();
  if (!publicSessionId) {
    throw new Error("Spectator session id was missing from the response.");
  }

  return { publicSessionId };
}

export async function publishWheelSpectatorSession(
  app: Pick<AppContext, "googleAuthEpoch" | "hasProAccess">,
  publicSessionId: string,
  snapshot: WheelSpectatorSnapshot
): Promise<void> {
  const response = await fetchAuthenticatedApiResponse(app as AppContext, "/wheel/public-session/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      publicSessionId,
      snapshot
    })
  }, {
    expireAuthOn401: false
  });

  if (!response.ok) {
    throw new Error("Failed to publish spectator session.");
  }
}

export async function fetchWheelSpectatorSnapshot(baseUrl: string, publicSessionId: string): Promise<{
  publicSessionId: string;
  snapshot: WheelSpectatorSnapshot;
}> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/wheel/public-session/${encodeURIComponent(publicSessionId)}`, {
    method: "GET",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "not_found" : "fetch_failed");
  }

  const body = await response.json() as WheelSpectatorReadResponse;
  const snapshot = normalizeWheelSpectatorSnapshot(body.snapshot);
  if (!snapshot) {
    throw new Error("fetch_failed");
  }
  return {
    publicSessionId: String(body.publicSessionId ?? "").trim(),
    snapshot
  };
}

export async function fetchWheelSpectatorRealtimeSubscribeToken(
  baseUrl: string,
  publicSessionId: string
): Promise<WorkspaceRealtimeSubscribeToken> {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/wheel/public-session/${encodeURIComponent(publicSessionId)}/realtime-token`,
    {
      method: "GET",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(response.status === 404 ? "not_found" : "fetch_failed");
  }

  const body = await response.json() as WheelSpectatorRealtimeTokenResponse;
  const room = String(body.room ?? "").trim();
  if (!room) {
    throw new Error("fetch_failed");
  }

  const rooms = Array.isArray(body.rooms)
    ? body.rooms.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [room];
  const rawToken = String(body.token ?? "").trim();
  const expiresAt = Number(body.expiresAt);
  return {
    room,
    rooms,
    token: rawToken || null,
    expiresAt: Number.isFinite(expiresAt) ? Math.floor(expiresAt) : null
  };
}

export async function fetchWheelSpectatorCount(
  app: Pick<AppContext, "googleAuthEpoch" | "hasProAccess">,
  publicSessionId: string
): Promise<number> {
  const response = await fetchAuthenticatedApiResponse(
    app as AppContext,
    `/wheel/public-session/${encodeURIComponent(publicSessionId)}/spectator-count`,
    {
      method: "GET"
    },
    {
      expireAuthOn401: false
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch spectator count.");
  }

  const body = await response.json() as WheelSpectatorCountResponse;
  const spectatorCount = Number(body.spectatorCount);
  return Number.isFinite(spectatorCount) && spectatorCount >= 0
    ? Math.floor(spectatorCount)
    : 0;
}
