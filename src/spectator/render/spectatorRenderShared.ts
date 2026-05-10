import type { GameSpectatorHeatLevel, GameSpectatorSnapshot } from "../../types/app.ts";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  return "—";
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

export function getSpectatorOutcomeSlots(snapshot: GameSpectatorSnapshot): GameSpectatorSnapshot["outcomeSlots"] {
  return Array.isArray(snapshot.outcomeSlots) ? snapshot.outcomeSlots : [];
}

export function getSpectatorBoardCells(snapshot: GameSpectatorSnapshot): GameSpectatorSnapshot["boardCells"] {
  return Array.isArray(snapshot.boardCells) ? snapshot.boardCells : [];
}

export function renderEmpty(title: string, body: string): string {
  return `
    <div class="spectator-shell">
      <section class="spectator-card spectator-empty">
        <div class="spectator-kicker">Game Spectator</div>
        <h1 class="spectator-empty__title">${escapeHtml(title)}</h1>
        <p class="spectator-empty__body">${escapeHtml(body)}</p>
      </section>
    </div>
  `;
}
