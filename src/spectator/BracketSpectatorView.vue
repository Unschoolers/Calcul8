<script setup lang="ts">
import { computed } from "vue";
import SpectatorEmptyState from "./SpectatorEmptyState.vue";
import {
  formatBracketParticipant,
  formatBracketRoll,
  formatStatusTone
} from "./spectatorFormatting.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";
import type { SpectatorPageState } from "./spectatorTypes.ts";

const props = defineProps<{
  state: Extract<SpectatorPageState, { status: "ready" }>;
}>();

type BracketMatch = NonNullable<GameSpectatorSnapshot["bracket"]>["matches"][number];

const snapshot = computed(() => props.state.snapshot);
const bracket = computed(() => snapshot.value.bracket);
const activeMatch = computed(() => bracket.value?.activeMatch ?? null);
const championMatch = computed(() => {
  const championParticipantId = bracket.value?.championParticipantId;
  if (!championParticipantId) return null;
  return bracket.value?.matches.find((match) => (
    match.participantAId === championParticipantId
    || match.participantBId === championParticipantId
  )) ?? null;
});
const championLabel = computed(() => {
  const championParticipantId = bracket.value?.championParticipantId;
  if (!championParticipantId) return "";
  return championMatch.value?.participantAId === championParticipantId
    ? championMatch.value?.participantALabel || ""
    : championMatch.value?.participantBLabel || "";
});
const heroSubcopy = computed(() => (
  bracket.value?.status === "complete"
    ? `${formatBracketParticipant(championLabel.value)} won the bracket.`
    : "Follow the current duel and the bracket tree as winners advance."
));

function playerClasses(match: BracketMatch, participantId: string | null): string[] {
  return [
    "spectator-bracket-player",
    match.winnerParticipantId && match.winnerParticipantId === participantId
      ? "spectator-bracket-player--winner"
      : ""
  ].filter(Boolean);
}
</script>

<template>
  <div
    v-if="bracket"
    class="spectator-shell"
  >
    <section class="spectator-hero">
      <div class="spectator-kicker">Live Bracket Spectator</div>
      <p class="spectator-subtitle spectator-subtitle--hero">{{ heroSubcopy }}</p>
    </section>

    <div class="spectator-grid">
      <section class="spectator-card spectator-now">
        <div class="spectator-now__header">
          <div>
            <div class="spectator-card__eyebrow">Now</div>
            <div class="spectator-now__headline">{{ activeMatch ? "Current duel" : "Champion" }}</div>
          </div>
          <div :class="['spectator-status', `spectator-status--${formatStatusTone(snapshot)}`]">
            {{ snapshot.sessionStatus === "ended" ? "Recap" : (snapshot.isSpinning ? "Rolling" : "Waiting") }}
          </div>
        </div>

        <div class="spectator-bracket-duel">
          <template v-if="activeMatch">
            <article class="spectator-bracket-duelist">
              <span>{{ formatBracketParticipant(activeMatch.participantALabel) }}</span>
              <div
                class="spectator-bracket-dice-tile"
                :aria-label="`Dice result for ${formatBracketParticipant(activeMatch.participantALabel)}`"
              >
                {{ formatBracketRoll(activeMatch.participantAResult) }}
              </div>
            </article>
            <div class="spectator-bracket-versus">VS</div>
            <article class="spectator-bracket-duelist">
              <span>{{ formatBracketParticipant(activeMatch.participantBLabel) }}</span>
              <div
                class="spectator-bracket-dice-tile"
                :aria-label="`Dice result for ${formatBracketParticipant(activeMatch.participantBLabel)}`"
              >
                {{ formatBracketRoll(activeMatch.participantBResult) }}
              </div>
            </article>
          </template>
          <div
            v-else
            class="spectator-bracket-champion"
          >
            {{ formatBracketParticipant(championLabel) }}
          </div>
        </div>

        <div class="spectator-result">
          <div class="spectator-result__meta">
            <span class="spectator-result__eyebrow">Prize</span>
            <strong>{{ activeMatch?.prizeLabel || "Settled" }}</strong>
          </div>
          <div class="spectator-result__subcopy">
            {{ snapshot.isSpinning ? "Dice are rolling." : (snapshot.lastResultLabel || "Waiting for the next match.") }}
          </div>
        </div>
      </section>

      <section class="spectator-card">
        <div class="spectator-card__eyebrow">Bracket</div>
        <div class="spectator-bracket-tree">
          <article
            v-for="match in bracket.matches"
            :key="match.id"
            :class="['spectator-bracket-match', `spectator-bracket-match--${match.status}`]"
          >
            <div class="spectator-bracket-match__meta">
              <span>Round {{ match.round }}</span>
              <span>{{ match.prizeLabel || "Prize" }}</span>
            </div>
            <div :class="playerClasses(match, match.participantAId)">
              <span>{{ formatBracketParticipant(match.participantALabel) }}</span>
              <strong>{{ formatBracketRoll(match.participantAResult) }}</strong>
            </div>
            <div :class="playerClasses(match, match.participantBId)">
              <span>{{ formatBracketParticipant(match.participantBLabel) }}</span>
              <strong>{{ formatBracketRoll(match.participantBResult) }}</strong>
            </div>
          </article>
          <div
            v-if="!bracket.matches.length"
            class="spectator-empty"
          >
            <p class="spectator-empty__body">Waiting for the bracket to start.</p>
          </div>
        </div>
      </section>

      <section class="spectator-card">
        <div class="spectator-card__eyebrow">Awards</div>
        <div class="spectator-reel">
          <article
            v-for="award in bracket.awards"
            :key="`${award.participantLabel}:${award.prizeLabel}`"
            class="spectator-reel__item"
          >
            <div class="spectator-reel__label">
              <span class="spectator-result__dot"></span>
              {{ award.participantLabel || "Winner" }}
            </div>
            <div class="spectator-subtitle">{{ award.prizeLabel }}</div>
          </article>
          <div
            v-if="!bracket.awards.length"
            class="spectator-empty"
          >
            <p class="spectator-empty__body">Awards will appear as matches resolve.</p>
          </div>
        </div>
      </section>
    </div>
  </div>
  <SpectatorEmptyState
    v-else
    title="Bracket unavailable"
    body="Refresh in a moment to load the latest bracket state."
  />
</template>
