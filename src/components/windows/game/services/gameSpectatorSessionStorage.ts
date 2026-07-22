import type { GameHostState } from "./gameHostState.ts";

export type StoredGameSpectatorSessionStatus = "inactive" | "starting" | "live" | "ended";

export type StoredGameSpectatorSessionState = {
  publicSessionId: string;
  status: StoredGameSpectatorSessionStatus;
  url: string;
  qrUrl: string;
};

type GameSpectatorSessionContext = Pick<GameHostState,
  "gameSpectatorSessionId" | "gameSpectatorSessionStatus" | "gameSpectatorSessionUrl" | "gameSpectatorSessionQrUrl"
>;

const LEGACY_WHEEL_SPECTATOR_FIELDS = {
  publicSessionId: "wheelSpectatorSessionId",
  status: "wheelSpectatorSessionStatus",
  url: "wheelSpectatorSessionUrl",
  qrUrl: "wheelSpectatorSessionQrUrl"
} as const;

function normalizeStoredStatus(value: unknown): StoredGameSpectatorSessionStatus {
  const status = String(value ?? "inactive");
  return status === "starting" || status === "live" || status === "ended" ? status : "inactive";
}

function readStringField(source: Record<string, unknown>, primaryKey: string, legacyKey: string): string {
  return String(source[primaryKey] ?? source[legacyKey] ?? "");
}

export function readGameSpectatorSessionStorageState(
  source: Record<string, unknown>
): StoredGameSpectatorSessionState {
  return {
    publicSessionId: readStringField(source, "gameSpectatorSessionId", LEGACY_WHEEL_SPECTATOR_FIELDS.publicSessionId),
    status: normalizeStoredStatus(source.gameSpectatorSessionStatus ?? source[LEGACY_WHEEL_SPECTATOR_FIELDS.status]),
    url: readStringField(source, "gameSpectatorSessionUrl", LEGACY_WHEEL_SPECTATOR_FIELDS.url),
    qrUrl: readStringField(source, "gameSpectatorSessionQrUrl", LEGACY_WHEEL_SPECTATOR_FIELDS.qrUrl)
  };
}

export function writeGameSpectatorSessionStorageState(
  target: Record<string, unknown>,
  context: GameSpectatorSessionContext
): void {
  const state = {
    publicSessionId: String(context.gameSpectatorSessionId ?? ""),
    status: normalizeStoredStatus(context.gameSpectatorSessionStatus),
    url: String(context.gameSpectatorSessionUrl ?? ""),
    qrUrl: String(context.gameSpectatorSessionQrUrl ?? "")
  };

  target.gameSpectatorSessionId = state.publicSessionId;
  target.gameSpectatorSessionStatus = state.status;
  target.gameSpectatorSessionUrl = state.url;
  target.gameSpectatorSessionQrUrl = state.qrUrl;

  // Persist the old wheel field names too so older local session snapshots and
  // older app builds can still recover active spectator links.
  target[LEGACY_WHEEL_SPECTATOR_FIELDS.publicSessionId] = state.publicSessionId;
  target[LEGACY_WHEEL_SPECTATOR_FIELDS.status] = state.status;
  target[LEGACY_WHEEL_SPECTATOR_FIELDS.url] = state.url;
  target[LEGACY_WHEEL_SPECTATOR_FIELDS.qrUrl] = state.qrUrl;
}
