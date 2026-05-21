import type { GameSpectatorHeatLevel, GameSpectatorSnapshot } from "../types/app.ts";
import { translateSpectatorMessage } from "./spectatorI18n.ts";

export function formatRelativeTime(timestamp: number, language: string | null | undefined = "en"): string {
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  if (elapsedMs < 60_000) return translateSpectatorMessage(language, "spectatorJustNow");
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return translateSpectatorMessage(language, "spectatorMinutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translateSpectatorMessage(language, "spectatorHoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return translateSpectatorMessage(language, "spectatorDaysAgo", { count: days });
}

export function formatHeatCopy(
  heat: GameSpectatorHeatLevel | null,
  label: string | null,
  language: string | null | undefined = "en"
): string {
  if (!heat || !label) return translateSpectatorMessage(language, "spectatorHeatWarmingUp");
  if (heat === "very_high") return translateSpectatorMessage(language, "spectatorHeatOverdue", { label });
  if (heat === "high") return translateSpectatorMessage(language, "spectatorHeatHeatingUp", { label });
  if (heat === "medium") return translateSpectatorMessage(language, "spectatorHeatInRange", { label });
  if (heat === "low") return translateSpectatorMessage(language, "spectatorHeatWarmingSlowly", { label });
  return translateSpectatorMessage(language, "spectatorHeatStillAround", { label });
}

export function formatHeatLabel(
  heat: GameSpectatorHeatLevel | null,
  language: string | null | undefined = "en"
): string {
  if (heat === "very_high") return translateSpectatorMessage(language, "spectatorHeatVeryHigh");
  if (heat === "high") return translateSpectatorMessage(language, "spectatorHeatHigh");
  if (heat === "medium") return translateSpectatorMessage(language, "spectatorHeatMedium");
  if (heat === "low") return translateSpectatorMessage(language, "spectatorHeatLow");
  if (heat === "very_low") return translateSpectatorMessage(language, "spectatorHeatVeryLow");
  return "-";
}

export function formatStatusLabel(
  snapshot: GameSpectatorSnapshot,
  isGridGame: boolean,
  language: string | null | undefined = "en"
): string {
  if (snapshot.sessionStatus === "ended") return translateSpectatorMessage(language, "spectatorStatusRecap");
  if (!snapshot.isSpinning) return translateSpectatorMessage(language, "spectatorStatusWaiting");
  return isGridGame
    ? translateSpectatorMessage(language, "spectatorStatusRevealing")
    : translateSpectatorMessage(language, "spectatorStatusSpinning");
}

export function formatStatusTone(snapshot: GameSpectatorSnapshot): "ended" | "spinning" | "waiting" {
  if (snapshot.sessionStatus === "ended") return "ended";
  return snapshot.isSpinning ? "spinning" : "waiting";
}

export function formatBracketParticipant(
  value: string | null | undefined,
  language: string | null | undefined = "en"
): string {
  return String(value || "").trim() || translateSpectatorMessage(language, "spectatorStatusWaiting");
}

export function formatBracketRoll(value: number | null | undefined): string {
  if (value == null) return "--";
  return Number.isFinite(Number(value)) ? String(value) : "--";
}
