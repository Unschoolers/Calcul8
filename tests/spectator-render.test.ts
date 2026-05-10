import assert from "node:assert/strict";
import { test } from "vitest";
import { renderSpectatorState } from "../src/spectator/render/spectatorRender.ts";
import type { GameSpectatorSnapshot } from "../src/types/app.ts";

function makeSnapshot(overrides: Partial<GameSpectatorSnapshot> = {}): GameSpectatorSnapshot {
  return {
    snapshotVersion: 2,
    gameName: "Test Game",
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 0,
    lastResultLabel: "",
    lastResultColor: "#d4af37",
    gameCurrentAngle: 0,
    outcomeSlots: [],
    boardCells: [],
    boardHighlightCellIndex: -1,
    boardResetAnimating: false,
    resultAnimation: null,
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    bracket: null,
    updatedAt: 100,
    ...overrides
  };
}

function htmlText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function countMatches(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

test("renderSpectatorState renders bracket duel and tree with dice tiles", () => {
  const html = renderSpectatorState({
    status: "ready",
    publicSessionId: "abc123",
    snapshot: makeSnapshot({
      gameName: "Bracket Night",
      gameType: "bracket",
      lastResultLabel: "Alex vs Bri",
      bracket: {
        status: "active",
        participantCount: 4,
        activeMatchId: "match-1",
        championParticipantId: null,
        activeMatch: {
          id: "match-1",
          round: 1,
          position: 1,
          status: "active",
          participantAId: "a",
          participantALabel: "Alex",
          participantBId: "b",
          participantBLabel: "Bri",
          winnerParticipantId: null,
          prizeLabel: "Top Prize",
          participantAResult: 6,
          participantBResult: 4
        },
        matches: [],
        recentRolls: [],
        awards: []
      }
    })
  });

  assert.match(html, /class="spectator-kicker">Live Bracket Spectator</);
  assert.equal(countMatches(html, /class="spectator-bracket-dice-tile"/g), 2);
  assert.match(htmlText(html), /Alex/);
  assert.match(htmlText(html), /Bri/);
  assert.match(htmlText(html), /Top Prize/);
});

test("renderSpectatorState renders grid cells and reset animation state", () => {
  const html = renderSpectatorState({
    status: "ready",
    publicSessionId: "abc123",
    snapshot: makeSnapshot({
      gameName: "Grid Night",
      gameType: "grid",
      sessionResultCount: 1,
      lastResultLabel: "Hit",
      boardHighlightCellIndex: 1,
      boardResetAnimating: true,
      boardCells: [
        { index: 0, revealed: true, label: "Hit", color: "#f00", tier: "hit", slotIndex: 3 },
        { index: 1, revealed: false, label: "", color: "", tier: "", slotIndex: -1 }
      ]
    })
  });

  assert.match(html, /class="spectator-kicker">Live Grid Spectator</);
  assert.match(html, /spectator-grid-board--resetting/);
  assert.equal(countMatches(html, /class="spectator-grid-cell /g), 2);
  assert.match(html, /spectator-grid-cell--highlighted[\s\S]*spectator-grid-cell__number">2</);
});

test("renderSpectatorState renders wheel canvas and proof link", () => {
  const html = renderSpectatorState({
    status: "ready",
    publicSessionId: "abc123",
    snapshot: makeSnapshot({
      gameName: "Wheel Night",
      gameType: "wheel",
      sessionResultCount: 2,
      lastResultLabel: "Prize",
      fairnessVerificationUrl: "https://example.test/proof",
      outcomeSlots: [
        { name: "Prize", color: "#f00", tier: "tier-1", isChase: false }
      ],
      recentFairnessHistory: [
        { spinNumber: 2, label: "Prize", color: "#f00", verificationUrl: "https://example.test/proof", timestamp: Date.now() }
      ]
    })
  });

  assert.match(html, /class="spectator-kicker">Live Wheel Spectator</);
  assert.match(html, /id="spectator-wheel-canvas"/);
  assert.match(html, /href="https:\/\/example\.test\/proof"/);
});
