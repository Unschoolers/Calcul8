import type { GameSpectatorHeatLevel, GameSpectatorSnapshot } from "../types/app.ts";

export function formatRelativeTime(timestamp: number): string {
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  if (elapsedMs < 60_000) return "just now";
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatHeatCopy(heat: GameSpectatorHeatLevel | null, label: string | null): string {
  if (!heat || !label) return "The game is warming up.";
  if (heat === "very_high") return `${label} is overdue.`;
  if (heat === "high") return `${label} is heating up.`;
  if (heat === "medium") return `${label} is in range.`;
  if (heat === "low") return `${label} is warming slowly.`;
  return `${label} is still hanging around.`;
}

export function formatHeatLabel(heat: GameSpectatorHeatLevel | null): string {
  if (heat === "very_high") return "very high";
  if (heat === "high") return "high";
  if (heat === "medium") return "medium";
  if (heat === "low") return "low";
  if (heat === "very_low") return "very low";
  return "-";
}

export function formatStatusLabel(snapshot: GameSpectatorSnapshot, isGridGame: boolean): string {
  if (snapshot.sessionStatus === "ended") return "Recap";
  if (!snapshot.isSpinning) return "Waiting";
  return isGridGame ? "Revealing" : "Spinning";
}

export function formatStatusTone(snapshot: GameSpectatorSnapshot): "ended" | "spinning" | "waiting" {
  if (snapshot.sessionStatus === "ended") return "ended";
  return snapshot.isSpinning ? "spinning" : "waiting";
}

export function formatBracketParticipant(value: string | null | undefined): string {
  return String(value || "").trim() || "Waiting";
}

export function formatBracketRoll(value: number | null | undefined): string {
  if (value == null) return "--";
  return Number.isFinite(Number(value)) ? String(value) : "--";
}
