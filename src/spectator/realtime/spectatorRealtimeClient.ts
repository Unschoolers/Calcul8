import { normalizeGamePublicSessionId } from "../../app-core/methods/ui/spectator/game-spectator.ts";
import type { GameSpectatorSnapshot } from "../../types/app.ts";

export const SPECTATOR_PUBLIC_SESSION_EVENT_TYPES = new Set([
  "game.public-session.updated",
  "wheel.public-session.updated"
]);

export type SpectatorRealtimeMessageResult =
  | { action: "ignore" }
  | { action: "refresh" }
  | { action: "apply"; snapshot: GameSpectatorSnapshot };

type SpectatorRealtimeEnvelope =
  | { type?: "connected" | "subscribed" | "error" }
  | { type?: "event"; eventType?: string; data?: unknown };

function isRealtimeEnvelope(value: unknown): value is SpectatorRealtimeEnvelope {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveSpectatorRealtimeMessage(args: {
  rawPayload: unknown;
  currentPublicSessionId: string;
  normalizeSnapshot: (value: unknown) => GameSpectatorSnapshot | null;
}): SpectatorRealtimeMessageResult {
  const { rawPayload, currentPublicSessionId, normalizeSnapshot } = args;
  if (!isRealtimeEnvelope(rawPayload)) return { action: "ignore" };
  if (rawPayload.type === "subscribed") return { action: "refresh" };
  if (
    rawPayload.type !== "event"
    || !SPECTATOR_PUBLIC_SESSION_EVENT_TYPES.has(String(rawPayload.eventType || ""))
  ) {
    return { action: "ignore" };
  }

  const raw = typeof rawPayload.data === "object" && rawPayload.data !== null && !Array.isArray(rawPayload.data)
    ? rawPayload.data as { publicSessionId?: unknown; snapshot?: unknown }
    : {};
  if (normalizeGamePublicSessionId(raw.publicSessionId) !== normalizeGamePublicSessionId(currentPublicSessionId)) {
    return { action: "ignore" };
  }

  const snapshot = normalizeSnapshot(raw.snapshot);
  return snapshot ? { action: "apply", snapshot } : { action: "refresh" };
}
