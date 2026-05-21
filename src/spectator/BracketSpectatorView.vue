<script setup lang="ts">
import { computed } from "vue";
import SpectatorEmptyState from "./SpectatorEmptyState.vue";
import {
  formatBracketParticipant,
  formatBracketRoll,
  formatStatusTone
} from "./spectatorFormatting.ts";
import { translateSpectatorMessage } from "./spectatorI18n.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";
import type { SpectatorPageState } from "./spectatorTypes.ts";

const props = defineProps<{
  state: Extract<SpectatorPageState, { status: "ready" }>;
  language: string;
}>();

type BracketMatch = NonNullable<GameSpectatorSnapshot["bracket"]>["matches"][number];

const snapshot = computed(() => props.state.snapshot);
const t = (key: string, params?: Record<string, string | number | null | undefined>) =>
  translateSpectatorMessage(props.language, key, params);
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
    ? t("spectatorBracketChampionWon", {
      champion: formatBracketParticipant(championLabel.value, props.language)
    })
    : t("spectatorBracketFollow")
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
      <div class="spectator-kicker">{{ t('spectatorBracketKicker') }}</div>
      <p class="spectator-subtitle spectator-subtitle--hero">{{ heroSubcopy }}</p>
    </section>

    <div class="spectator-grid">
      <section class="spectator-card spectator-now">
        <div class="spectator-now__header">
          <div>
            <div class="spectator-card__eyebrow">{{ t('spectatorNowLabel') }}</div>
            <div class="spectator-now__headline">{{ activeMatch ? t('spectatorCurrentDuel') : t('spectatorChampionLabel') }}</div>
          </div>
          <div :class="['spectator-status', `spectator-status--${formatStatusTone(snapshot)}`]">
            {{ snapshot.sessionStatus === "ended" ? t('spectatorStatusRecap') : (snapshot.isSpinning ? t('spectatorStatusRolling') : t('spectatorStatusWaiting')) }}
          </div>
        </div>

        <div class="spectator-bracket-duel">
          <template v-if="activeMatch">
            <article class="spectator-bracket-duelist">
              <span>{{ formatBracketParticipant(activeMatch.participantALabel, language) }}</span>
              <div
                class="spectator-bracket-dice-tile"
                :aria-label="t('spectatorDiceResultFor', { participant: formatBracketParticipant(activeMatch.participantALabel, language) })"
              >
                {{ formatBracketRoll(activeMatch.participantAResult) }}
              </div>
            </article>
            <div class="spectator-bracket-versus">{{ t('spectatorBracketVersus') }}</div>
            <article class="spectator-bracket-duelist">
              <span>{{ formatBracketParticipant(activeMatch.participantBLabel, language) }}</span>
              <div
                class="spectator-bracket-dice-tile"
                :aria-label="t('spectatorDiceResultFor', { participant: formatBracketParticipant(activeMatch.participantBLabel, language) })"
              >
                {{ formatBracketRoll(activeMatch.participantBResult) }}
              </div>
            </article>
          </template>
          <div
            v-else
            class="spectator-bracket-champion"
          >
            {{ formatBracketParticipant(championLabel, language) }}
          </div>
        </div>

        <div class="spectator-result">
          <div class="spectator-result__meta">
            <span class="spectator-result__eyebrow">{{ t('spectatorPrizeLabel') }}</span>
            <strong>{{ activeMatch?.prizeLabel || t('spectatorSettledLabel') }}</strong>
          </div>
          <div class="spectator-result__subcopy">
            {{ snapshot.isSpinning ? t('spectatorDiceRolling') : (snapshot.lastResultLabel || t('spectatorWaitingNextMatch')) }}
          </div>
        </div>
      </section>

      <section class="spectator-card">
        <div class="spectator-card__eyebrow">{{ t('spectatorBracketLabel') }}</div>
        <div class="spectator-bracket-tree">
          <article
            v-for="match in bracket.matches"
            :key="match.id"
            :class="['spectator-bracket-match', `spectator-bracket-match--${match.status}`]"
          >
            <div class="spectator-bracket-match__meta">
              <span>{{ t('spectatorRoundLabel', { round: match.round }) }}</span>
              <span>{{ match.prizeLabel || t('spectatorPrizeLabel') }}</span>
            </div>
            <div :class="playerClasses(match, match.participantAId)">
              <span>{{ formatBracketParticipant(match.participantALabel, language) }}</span>
              <strong>{{ formatBracketRoll(match.participantAResult) }}</strong>
            </div>
            <div :class="playerClasses(match, match.participantBId)">
              <span>{{ formatBracketParticipant(match.participantBLabel, language) }}</span>
              <strong>{{ formatBracketRoll(match.participantBResult) }}</strong>
            </div>
          </article>
          <div
            v-if="!bracket.matches.length"
            class="spectator-empty"
          >
            <p class="spectator-empty__body">{{ t('spectatorWaitingBracketStart') }}</p>
          </div>
        </div>
      </section>

      <section class="spectator-card">
        <div class="spectator-card__eyebrow">{{ t('spectatorAwardsLabel') }}</div>
        <div class="spectator-reel">
          <article
            v-for="award in bracket.awards"
            :key="`${award.participantLabel}:${award.prizeLabel}`"
            class="spectator-reel__item"
          >
            <div class="spectator-reel__label">
              <span class="spectator-result__dot"></span>
              {{ award.participantLabel || t('spectatorWinnerFallback') }}
            </div>
            <div class="spectator-subtitle">{{ award.prizeLabel }}</div>
          </article>
          <div
            v-if="!bracket.awards.length"
            class="spectator-empty"
          >
            <p class="spectator-empty__body">{{ t('spectatorAwardsPending') }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
  <SpectatorEmptyState
    v-else
    :title="t('spectatorBracketUnavailableTitle')"
    :body="t('spectatorBracketUnavailableBody')"
    :language="language"
  />
</template>
