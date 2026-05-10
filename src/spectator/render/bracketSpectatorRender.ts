import type { SpectatorPageState } from "./spectatorRenderTypes.ts";
import {
  escapeHtml,
  formatStatusTone,
  renderEmpty
} from "./spectatorRenderShared.ts";

function formatBracketParticipant(value: string): string {
  return String(value || "").trim() || "Waiting";
}

function formatBracketRoll(value: number | null | undefined): string {
  if (value == null) return "--";
  return Number.isFinite(Number(value)) ? String(value) : "--";
}

export function renderBracketState(state: Extract<SpectatorPageState, { status: "ready" }>): string {
  const { snapshot } = state;
  const bracket = snapshot.bracket;
  if (!bracket) {
    return renderEmpty("Bracket unavailable", "Refresh in a moment to load the latest bracket state.");
  }

  const activeMatch = bracket.activeMatch;
  const champion = bracket.championParticipantId
    ? bracket.matches.find((match) => (
        match.participantAId === bracket.championParticipantId
        || match.participantBId === bracket.championParticipantId
      ))
    : null;
  const championLabel = champion?.participantAId === bracket.championParticipantId
    ? champion.participantALabel
    : champion?.participantBLabel;
  const treeHtml = bracket.matches.length
    ? bracket.matches.map((match) => {
        const participantAWon = match.winnerParticipantId && match.winnerParticipantId === match.participantAId;
        const participantBWon = match.winnerParticipantId && match.winnerParticipantId === match.participantBId;
        return `
          <article class="spectator-bracket-match spectator-bracket-match--${escapeHtml(match.status)}">
            <div class="spectator-bracket-match__meta">
              <span>Round ${match.round}</span>
              <span>${escapeHtml(match.prizeLabel || "Prize")}</span>
            </div>
            <div class="spectator-bracket-player ${participantAWon ? "spectator-bracket-player--winner" : ""}">
              <span>${escapeHtml(formatBracketParticipant(match.participantALabel))}</span>
              <strong>${escapeHtml(formatBracketRoll(match.participantAResult))}</strong>
            </div>
            <div class="spectator-bracket-player ${participantBWon ? "spectator-bracket-player--winner" : ""}">
              <span>${escapeHtml(formatBracketParticipant(match.participantBLabel))}</span>
              <strong>${escapeHtml(formatBracketRoll(match.participantBResult))}</strong>
            </div>
          </article>
        `;
      }).join("")
    : `<div class="spectator-empty"><p class="spectator-empty__body">Waiting for the bracket to start.</p></div>`;
  const awardsHtml = bracket.awards.length
    ? bracket.awards.map((award) => `
        <article class="spectator-reel__item">
          <div class="spectator-reel__label">
            <span class="spectator-result__dot"></span>
            ${escapeHtml(award.participantLabel || "Winner")}
          </div>
          <div class="spectator-subtitle">${escapeHtml(award.prizeLabel)}</div>
        </article>
      `).join("")
    : `<div class="spectator-empty"><p class="spectator-empty__body">Awards will appear as matches resolve.</p></div>`;

  return `
    <div class="spectator-shell">
      <section class="spectator-hero">
        <div class="spectator-kicker">Live Bracket Spectator</div>
        <h1 class="spectator-title">${escapeHtml(snapshot.gameName)}</h1>
        <p class="spectator-subtitle spectator-subtitle--hero">
          ${escapeHtml(bracket.status === "complete"
            ? `${formatBracketParticipant(championLabel || "")} won the bracket.`
            : "Follow the current duel and the bracket tree as winners advance.")}
        </p>
      </section>

      <div class="spectator-grid">
        <section class="spectator-card spectator-now">
          <div class="spectator-now__header">
            <div>
              <div class="spectator-card__eyebrow">Now</div>
              <div class="spectator-now__headline">${activeMatch ? "Current duel" : "Champion"}</div>
            </div>
            <div class="spectator-status spectator-status--${escapeHtml(formatStatusTone(snapshot))}">
              ${escapeHtml(snapshot.sessionStatus === "ended" ? "Recap" : (snapshot.isSpinning ? "Rolling" : "Waiting"))}
            </div>
          </div>

          <div class="spectator-bracket-duel">
            ${activeMatch
              ? `
                <article class="spectator-bracket-duelist">
                  <span>${escapeHtml(formatBracketParticipant(activeMatch.participantALabel))}</span>
                  <div
                    class="spectator-bracket-dice-tile"
                    aria-label="Dice result for ${escapeHtml(formatBracketParticipant(activeMatch.participantALabel))}"
                  >
                    ${escapeHtml(formatBracketRoll(activeMatch.participantAResult))}
                  </div>
                </article>
                <div class="spectator-bracket-versus">VS</div>
                <article class="spectator-bracket-duelist">
                  <span>${escapeHtml(formatBracketParticipant(activeMatch.participantBLabel))}</span>
                  <div
                    class="spectator-bracket-dice-tile"
                    aria-label="Dice result for ${escapeHtml(formatBracketParticipant(activeMatch.participantBLabel))}"
                  >
                    ${escapeHtml(formatBracketRoll(activeMatch.participantBResult))}
                  </div>
                </article>
              `
              : `<div class="spectator-bracket-champion">${escapeHtml(formatBracketParticipant(championLabel || ""))}</div>`}
          </div>

          <div class="spectator-result">
            <div class="spectator-result__meta">
              <span class="spectator-result__eyebrow">Prize</span>
              <strong>${escapeHtml(activeMatch?.prizeLabel || "Settled")}</strong>
            </div>
            <div class="spectator-result__subcopy">
              ${escapeHtml(snapshot.isSpinning ? "Dice are rolling." : (snapshot.lastResultLabel || "Waiting for the next match."))}
            </div>
          </div>
        </section>

        <section class="spectator-card">
          <div class="spectator-card__eyebrow">Bracket</div>
          <div class="spectator-bracket-tree">${treeHtml}</div>
        </section>

        <section class="spectator-card">
          <div class="spectator-card__eyebrow">Awards</div>
          <div class="spectator-reel">${awardsHtml}</div>
        </section>
      </div>
    </div>
  `;
}
