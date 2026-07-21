import type { GameSpectatorSnapshot } from "../../../../types/app.ts";
import type {
  GameAuthenticatedContext,
  GamePublicSessionContext
} from "../../../context/game.ts";
import type { WorkspaceRealtimeSubscribeToken } from "../../workspace-realtime-api.ts";
import { fetchAuthenticatedApiResponse } from "../common/shared.ts";
import { normalizeGameSpectatorSnapshot } from "./game-spectator-contract.ts";

type GameSpectatorCreateResponse = {
  publicSessionId?: unknown;
};

type GameSpectatorReadResponse = {
  publicSessionId?: unknown;
  snapshot?: unknown;
};

type GameSpectatorRealtimeTokenResponse = {
  room?: unknown;
  rooms?: unknown;
  token?: unknown;
  expiresAt?: unknown;
};

type GameSpectatorCountResponse = {
  publicSessionId?: unknown;
  spectatorCount?: unknown;
};

export class GameSpectatorSessionNotFoundError extends Error {
  constructor() {
    super("Spectator session was not found.");
    this.name = "GameSpectatorSessionNotFoundError";
  }
}

export function isGameSpectatorSessionNotFoundError(error: unknown): boolean {
  return error instanceof GameSpectatorSessionNotFoundError
    || (error instanceof Error && error.name === "GameSpectatorSessionNotFoundError");
}

export function normalizeGamePublicSessionId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildGamePublicSessionPath(publicSessionId?: string, suffix = ""): string {
  const basePath = "/game/public-session";
  if (!publicSessionId) return `${basePath}${suffix}`;
  return `${basePath}/${encodeURIComponent(normalizeGamePublicSessionId(publicSessionId))}${suffix}`;
}

export async function createGameSpectatorSession(
  app: GamePublicSessionContext,
  snapshot: GameSpectatorSnapshot
): Promise<{ publicSessionId: string }> {
  const response = await fetchAuthenticatedApiResponse(app, buildGamePublicSessionPath(), {
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

  const body = await response.json() as GameSpectatorCreateResponse;
  const publicSessionId = normalizeGamePublicSessionId(body.publicSessionId);
  if (!publicSessionId) {
    throw new Error("Spectator session id was missing from the response.");
  }

  return { publicSessionId };
}

export async function publishGameSpectatorSession(
  app: GameAuthenticatedContext,
  publicSessionId: string,
  snapshot: GameSpectatorSnapshot
): Promise<void> {
  const response = await fetchAuthenticatedApiResponse(app, buildGamePublicSessionPath(undefined, "/publish"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      publicSessionId: normalizeGamePublicSessionId(publicSessionId),
      snapshot
    })
  }, {
    expireAuthOn401: false
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new GameSpectatorSessionNotFoundError();
    }
    throw new Error("Failed to publish spectator session.");
  }
}

export async function fetchGameSpectatorSnapshot(baseUrl: string, publicSessionId: string): Promise<{
  publicSessionId: string;
  snapshot: GameSpectatorSnapshot;
}> {
  const normalizedPublicSessionId = normalizeGamePublicSessionId(publicSessionId);
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${buildGamePublicSessionPath(normalizedPublicSessionId)}`, {
    method: "GET",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "not_found" : "fetch_failed");
  }

  const body = await response.json() as GameSpectatorReadResponse;
  const snapshot = normalizeGameSpectatorSnapshot(body.snapshot);
  if (!snapshot) {
    throw new Error("fetch_failed");
  }
  return {
    publicSessionId: normalizeGamePublicSessionId(body.publicSessionId),
    snapshot
  };
}

export async function fetchGameSpectatorRealtimeSubscribeToken(
  baseUrl: string,
  publicSessionId: string
): Promise<WorkspaceRealtimeSubscribeToken> {
  const normalizedPublicSessionId = normalizeGamePublicSessionId(publicSessionId);
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}${buildGamePublicSessionPath(normalizedPublicSessionId, "/realtime-token")}`,
    {
      method: "GET",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(response.status === 404 ? "not_found" : "fetch_failed");
  }

  const body = await response.json() as GameSpectatorRealtimeTokenResponse;
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

export async function fetchGameSpectatorCount(
  app: GameAuthenticatedContext,
  publicSessionId: string
): Promise<number> {
  const response = await fetchAuthenticatedApiResponse(
    app,
    buildGamePublicSessionPath(publicSessionId, "/spectator-count"),
    {
      method: "GET"
    },
    {
      expireAuthOn401: false
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new GameSpectatorSessionNotFoundError();
    }
    throw new Error("Failed to fetch spectator count.");
  }

  const body = await response.json() as GameSpectatorCountResponse;
  const spectatorCount = Number(body.spectatorCount);
  return Number.isFinite(spectatorCount) && spectatorCount >= 0
    ? Math.floor(spectatorCount)
    : 0;
}
