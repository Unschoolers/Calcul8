import type { GameSpectatorSnapshot } from "../types/app.ts";

export const SPECTATOR_WHEEL_CANVAS_ID = "spectator-wheel-canvas";

export type SpectatorRealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "catching_up"
  | "recovered"
  | "stale"
  | "ended";

export type SpectatorPageState =
  | { status: "loading" }
  | {
      status: "ready";
      publicSessionId: string;
      snapshot: GameSpectatorSnapshot;
      realtimeStatus?: SpectatorRealtimeStatus;
    }
  | { status: "not_found" }
  | { status: "error" };
