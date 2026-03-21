import { createHmac } from "node:crypto";
import type { InvocationContext } from "@azure/functions";
import type { ApiConfig } from "../types";

const DEFAULT_REALTIME_PUBLISH_URL = "https://ws.whatfees.ca/internal/publish";
const REALTIME_PUBLISH_TIMEOUT_MS = 5_000;

type RealtimeLogger = Pick<InvocationContext, "warn">;

type SignedSubscribeTokenPayload = {
  rooms: string[];
  userId?: string;
  exp?: number;
};

export function buildWorkspaceLotRealtimeRoom(workspaceId: string, lotId: string): string {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

export function buildWorkspacePresenceRealtimeRoom(workspaceId: string): string {
  return `workspace:${workspaceId}:presence`;
}

export function signRealtimeSubscribeToken(
  secret: string,
  payload: SignedSubscribeTokenPayload
): string {
  const normalizedPayload: SignedSubscribeTokenPayload = {
    rooms: Array.isArray(payload.rooms) ? payload.rooms.map((room) => String(room || "").trim()).filter(Boolean) : [],
    userId: String(payload.userId ?? "").trim() || undefined,
    exp: Number.isFinite(Number(payload.exp)) ? Math.floor(Number(payload.exp)) : undefined
  };
  const encodedPayload = Buffer.from(JSON.stringify(normalizedPayload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function resolveRealtimePublishUrl(config: ApiConfig): string {
  const configured = String(config.realtimePublishUrl ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return config.apiEnv === "prod" ? DEFAULT_REALTIME_PUBLISH_URL : "";
}

export async function publishWorkspaceLotRealtimeEvent(
  config: ApiConfig,
  args: {
    workspaceId?: string;
    lotId: string;
    eventType: string;
    data?: unknown;
    logger?: RealtimeLogger;
  }
): Promise<boolean> {
  const workspaceId = String(args.workspaceId ?? "").trim();
  if (!workspaceId) return false;

  const publishUrl = resolveRealtimePublishUrl(config);
  const internalApiKey = String(config.realtimeInternalApiKey ?? "").trim();
  if (!publishUrl || !internalApiKey) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REALTIME_PUBLISH_TIMEOUT_MS);

  try {
    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalApiKey}`
      },
      body: JSON.stringify({
        room: buildWorkspaceLotRealtimeRoom(workspaceId, args.lotId),
        eventType: args.eventType,
        data: args.data
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      args.logger?.warn?.(
        `[realtime] Failed to publish ${args.eventType} for workspace ${workspaceId} lot ${args.lotId} (${response.status}).`
      );
      return false;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown realtime publish error.";
    args.logger?.warn?.(
      `[realtime] Failed to publish ${args.eventType} for workspace ${workspaceId} lot ${args.lotId}: ${message}`
    );
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
