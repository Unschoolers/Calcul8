import type { GameSpectatorSnapshot } from "../../../../types/app.ts";

export type SpectatorReadyState = {
  status: "ready";
  publicSessionId: string;
  snapshot: GameSpectatorSnapshot;
};

function getSpectatorSnapshotUpdatedAt(snapshot: GameSpectatorSnapshot | null | undefined): number {
  return Math.max(0, Math.floor(Number(snapshot?.updatedAt) || 0));
}

export function shouldApplySpectatorReadyState(
  currentState: SpectatorReadyState | null,
  nextState: SpectatorReadyState
): boolean {
  const currentUpdatedAt = getSpectatorSnapshotUpdatedAt(currentState?.snapshot);
  const nextUpdatedAt = getSpectatorSnapshotUpdatedAt(nextState.snapshot);
  if (currentUpdatedAt > 0 && nextUpdatedAt > 0 && nextUpdatedAt < currentUpdatedAt) {
    return false;
  }
  return true;
}
