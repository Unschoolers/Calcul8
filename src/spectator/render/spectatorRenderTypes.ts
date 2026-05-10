import type { GameSpectatorSnapshot } from "../../types/app.ts";

export const SPECTATOR_WHEEL_CANVAS_ID = "spectator-wheel-canvas";

export type SpectatorPageState =
  | { status: "loading" }
  | { status: "ready"; publicSessionId: string; snapshot: GameSpectatorSnapshot }
  | { status: "not_found" }
  | { status: "error" };
