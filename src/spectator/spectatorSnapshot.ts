import type { GameSpectatorSnapshot } from "../types/app.ts";

export function getSpectatorOutcomeSlots(snapshot: GameSpectatorSnapshot): GameSpectatorSnapshot["outcomeSlots"] {
  return Array.isArray(snapshot.outcomeSlots) ? snapshot.outcomeSlots : [];
}

export function getSpectatorBoardCells(snapshot: GameSpectatorSnapshot): GameSpectatorSnapshot["boardCells"] {
  return Array.isArray(snapshot.boardCells) ? snapshot.boardCells : [];
}

