import type { SpectatorPageState } from "./spectatorRenderTypes.ts";
import { SPECTATOR_WHEEL_CANVAS_ID } from "./spectatorRenderTypes.ts";
import {
  escapeHtml,
  formatHeatCopy,
  formatHeatLabel,
  formatRelativeTime,
  formatStatusLabel,
  formatStatusTone,
  getSpectatorBoardCells,
  getSpectatorOutcomeSlots
} from "./spectatorRenderShared.ts";

export function renderWheelOrGridState(state: Extract<SpectatorPageState, { status: "ready" }>): string {
  const { snapshot } = state;
  const outcomeSlots = getSpectatorOutcomeSlots(snapshot);
  const boardCells = getSpectatorBoardCells(snapshot);
  const isGridGame = snapshot.gameType === "grid" || boardCells.length > 0;
  const gridColumns = Math.ceil(Math.sqrt(Math.max(1, boardCells.length)));
  const revealedGridCount = boardCells.filter((cell) => cell.revealed).length;
  const gridProgressLabel = boardCells.length > 0 ? `${revealedGridCount}/${boardCells.length}` : "0/0";
  const heroSubcopy = snapshot.sessionResultCount > 0
    ? (isGridGame
      ? `${gridProgressLabel} cells opened. ${formatHeatCopy(snapshot.featuredChaseHeat, snapshot.featuredChaseLabel)}`
      : `Watching live: ${formatHeatCopy(snapshot.featuredChaseHeat, snapshot.featuredChaseLabel)}`)
    : `The ${isGridGame ? "grid" : "wheel"} is live. Stay here for the next verified result.`;
  const latestResultLabel = String(snapshot.lastResultLabel || "").trim() || "Waiting for the next result";
  const latestResultColor = String(snapshot.lastResultColor || "#d4af37");
  const latestResultSubcopy = snapshot.sessionResultCount > 0
    ? (isGridGame ? latestResultLabel : formatHeatCopy(snapshot.featuredChaseHeat, snapshot.featuredChaseLabel))
    : `The next verified ${isGridGame ? "reveal" : "result"} will land here as soon as the ${isGridGame ? "cell opens" : "wheel spins"}.`;
  const reelHtml = snapshot.recentFairnessHistory.length
    ? snapshot.recentFairnessHistory.map((entry) => `
        <article class="spectator-reel__item">
          <div class="spectator-reel__top">
            <div class="spectator-reel__spin">Result #${entry.spinNumber}</div>
            <div>${escapeHtml(formatRelativeTime(entry.timestamp))}</div>
          </div>
          <div class="spectator-reel__label">
            <span class="spectator-result__dot" style="background:${escapeHtml(entry.color)}"></span>
            ${escapeHtml(entry.label)}
          </div>
          ${entry.verificationUrl
            ? `<a class="spectator-reel__verify" href="${escapeHtml(entry.verificationUrl)}" target="_blank" rel="noopener noreferrer">Open proof</a>`
            : ""}
        </article>
      `).join("")
    : `<div class="spectator-empty"><p class="spectator-empty__body">Waiting for the first verified result.</p></div>`;

  const chaseHtml = snapshot.chaseBoard.length
    ? snapshot.chaseBoard.map((entry) => `
        <article class="spectator-chase spectator-chase--${escapeHtml(entry.status)}">
          <div class="spectator-chase__top">
            <div class="spectator-chase__title">
              <span class="spectator-result__dot" style="background:${escapeHtml(entry.color)}"></span>
              ${escapeHtml(entry.label)}
            </div>
            <div class="spectator-chase__status spectator-chase__status--${escapeHtml(entry.status)}">
              ${entry.status === "live" ? "Live" : "Claimed"}
            </div>
          </div>
          <div class="spectator-chase__meta">
            <span class="spectator-pill">Hits ${entry.hitCount}</span>
            <span class="spectator-pill">Chance ${Math.round(Number(entry.slots || 0))}%</span>
            ${entry.remainingHits != null ? `<span class="spectator-pill">${entry.remainingHits} hit${entry.remainingHits === 1 ? "" : "s"} left</span>` : ""}
            ${entry.isFeatured ? `<span class="spectator-pill spectator-pill--heat-${escapeHtml(String(snapshot.featuredChaseHeat || "low"))}">Featured prize</span>` : ""}
          </div>
        </article>
      `).join("")
    : `<div class="spectator-empty"><p class="spectator-empty__body">No prize board is active for this game.</p></div>`;

  return `
    <div class="spectator-shell">
      <section class="spectator-hero">
        <div class="spectator-kicker">${isGridGame ? "Live Grid Spectator" : "Live Wheel Spectator"}</div>
        <h1 class="spectator-title">${escapeHtml(snapshot.gameName)}</h1>
        <p class="spectator-subtitle spectator-subtitle--hero">${escapeHtml(heroSubcopy)}</p>
      </section>

      <div class="spectator-grid">
        <section class="spectator-card spectator-now">
          <div class="spectator-now__glow spectator-now__glow--${escapeHtml(String(snapshot.featuredChaseHeat || "low"))}"></div>
          <div class="spectator-now__header">
            <div>
              <div class="spectator-card__eyebrow">Now</div>
              <div class="spectator-now__headline">Current moment</div>
            </div>
            <div class="spectator-status spectator-status--${escapeHtml(formatStatusTone(snapshot))}">
              ${escapeHtml(formatStatusLabel(snapshot, isGridGame))}
            </div>
          </div>

          <div class="spectator-now__summary">
            <div class="spectator-now__metric">
              <span class="spectator-now__metric-label">${isGridGame ? "Reveal" : "Spin"}</span>
              <strong class="spectator-now__metric-value">#${snapshot.sessionResultCount}</strong>
            </div>
            <div class="spectator-now__metric spectator-now__metric--heat-${escapeHtml(String(snapshot.featuredChaseHeat || "low"))}">
              <span class="spectator-now__metric-label">Heat</span>
              <strong class="spectator-now__metric-value">${escapeHtml(formatHeatLabel(snapshot.featuredChaseHeat))}</strong>
            </div>
            <div class="spectator-now__metric spectator-now__metric--accent">
              <span class="spectator-now__metric-label">Watching</span>
              <strong class="spectator-now__metric-value">${escapeHtml(snapshot.featuredChaseLabel || "Prize board")}</strong>
            </div>
          </div>

          <div class="spectator-now__stage">
            ${isGridGame && boardCells.length
              ? `
                <div class="spectator-grid-board ${snapshot.boardResetAnimating === true ? "spectator-grid-board--resetting" : ""}" style="--spectator-grid-columns:${gridColumns}">
                  ${boardCells.map((cell) => `
                    <div
                      class="spectator-grid-cell ${cell.revealed ? "spectator-grid-cell--revealed" : ""} ${snapshot.boardHighlightCellIndex === cell.index ? "spectator-grid-cell--latest" : ""} ${snapshot.boardHighlightCellIndex === cell.index && !cell.revealed ? "spectator-grid-cell--highlighted" : ""}"
                      style="${cell.revealed ? `--spectator-grid-cell-color:${escapeHtml(cell.color)}` : ""}"
                    >
                      ${cell.revealed
                        ? `<span class="spectator-grid-cell__dot"></span><span class="spectator-grid-cell__label">${escapeHtml(cell.label)}</span>`
                        : `<span class="spectator-grid-cell__number">${cell.index + 1}</span>`}
                    </div>
                  `).join("")}
                </div>
              `
              : ""}
            ${!isGridGame && outcomeSlots.length
              ? `
                <div class="spectator-wheel-frame">
                  <div class="wheel-outer">
                    <div class="wheel-disc">
                      <canvas id="${SPECTATOR_WHEEL_CANVAS_ID}" class="wheel-canvas"></canvas>
                      <div class="wheel-center-cap" aria-hidden="true">
                        <div class="wheel-center-cap__icon" style="transform: rotate(${Number.isFinite(snapshot.gameCurrentAngle) ? snapshot.gameCurrentAngle : 0}rad)">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                            <path d="M12 2L13.09 8.26L20 12L13.09 15.74L12 22L10.91 15.74L4 12L10.91 8.26L12 2Z"></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div class="wheel-pointer" aria-hidden="true"></div>
                  </div>
                </div>
              `
              : ""}

            <div class="spectator-result" style="--spectator-result-color:${escapeHtml(latestResultColor)}">
              <div class="spectator-result__meta">
                <span class="spectator-result__eyebrow">Latest result</span>
                <strong>${snapshot.isSpinning ? "Live" : "Settled"}</strong>
              </div>
              <div class="spectator-result__subcopy">
                ${escapeHtml(latestResultSubcopy)}
              </div>
              ${snapshot.fairnessVerificationUrl
                ? `<a class="spectator-result__proof" href="${escapeHtml(snapshot.fairnessVerificationUrl)}" target="_blank" rel="noopener noreferrer">Verify this result</a>`
                : ""}
            </div>
          </div>
        </section>

        <section class="spectator-card">
          <div class="spectator-card__eyebrow">Recent</div>
          <div class="spectator-reel">${reelHtml}</div>
        </section>

        <section class="spectator-card">
          <div class="spectator-card__eyebrow">Prizes</div>
          <div class="spectator-chases">${chaseHtml}</div>
        </section>

      <section class="spectator-card spectator-trust">
        <div class="spectator-card__eyebrow">Trust</div>
          <p class="spectator-subtitle">The result is committed before it lands, then revealed after the ${isGridGame ? "cell opens" : "spin"} so anyone can verify it.</p>
          <ol class="spectator-trust__steps">
            <li>The proof is locked before the result finishes.</li>
            <li>The winning result is revealed after the ${isGridGame ? "cell opens" : "spin"}.</li>
            <li>Anyone can open the proof page and verify the outcome.</li>
          </ol>
          ${snapshot.fairnessVerificationUrl
            ? `<a class="spectator-reel__verify" href="${escapeHtml(snapshot.fairnessVerificationUrl)}" target="_blank" rel="noopener noreferrer">Open the latest proof</a>`
            : ""}
        </section>
      </div>
    </div>
  `;
}
