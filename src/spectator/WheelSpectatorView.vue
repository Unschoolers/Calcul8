<script setup lang="ts">
import { computed } from "vue";
import SpectatorNowMetrics from "./SpectatorNowMetrics.vue";
import SpectatorPrizeBoard from "./SpectatorPrizeBoard.vue";
import SpectatorRecentResults from "./SpectatorRecentResults.vue";
import SpectatorTrustCard from "./SpectatorTrustCard.vue";
import {
  formatHeatCopy,
  formatStatusLabel,
  formatStatusTone
} from "./spectatorFormatting.ts";
import { translateSpectatorMessage } from "./spectatorI18n.ts";
import {
  getSpectatorOutcomeSlots
} from "./spectatorSnapshot.ts";
import {
  SPECTATOR_WHEEL_CANVAS_ID,
  type SpectatorPageState
} from "./spectatorTypes.ts";

const props = defineProps<{
  state: Extract<SpectatorPageState, { status: "ready" }>;
  language: string;
}>();

const snapshot = computed(() => props.state.snapshot);
const t = (key: string, params?: Record<string, string | number | null | undefined>) =>
  translateSpectatorMessage(props.language, key, params);
const outcomeSlots = computed(() => getSpectatorOutcomeSlots(snapshot.value));
const heroSubcopy = computed(() => (
  snapshot.value.sessionResultCount > 0
    ? t("spectatorWatchingLive", {
      heatCopy: formatHeatCopy(snapshot.value.featuredChaseHeat, snapshot.value.featuredChaseLabel, props.language)
    })
    : t("spectatorWheelEmptyHero")
));
const latestResultColor = computed(() => String(snapshot.value.lastResultColor || "#d4af37"));
const latestResultSubcopy = computed(() => (
  snapshot.value.sessionResultCount > 0
    ? formatHeatCopy(snapshot.value.featuredChaseHeat, snapshot.value.featuredChaseLabel, props.language)
    : t("spectatorWheelPendingResult")
));
const centerCapAngle = computed(() => (
  Number.isFinite(snapshot.value.gameCurrentAngle) ? snapshot.value.gameCurrentAngle : 0
));
</script>

<template>
  <div class="spectator-shell">
    <section class="spectator-hero">
      <div class="spectator-kicker">{{ t('spectatorWheelKicker') }}</div>
      <p class="spectator-subtitle spectator-subtitle--hero">{{ heroSubcopy }}</p>
    </section>

    <div class="spectator-grid">
      <section class="spectator-card spectator-now">
        <div :class="['spectator-now__glow', `spectator-now__glow--${snapshot.featuredChaseHeat || 'low'}`]"></div>
        <div class="spectator-now__header">
          <div>
            <div class="spectator-card__eyebrow">{{ t('spectatorNowLabel') }}</div>
            <div class="spectator-now__headline">{{ t('spectatorCurrentMoment') }}</div>
          </div>
          <div :class="['spectator-status', `spectator-status--${formatStatusTone(snapshot)}`]">
            {{ formatStatusLabel(snapshot, false, language) }}
          </div>
        </div>

        <SpectatorNowMetrics
          :result-label="t('spectatorSpinLabel')"
          :result-count="snapshot.sessionResultCount"
          :featured-chase-heat="snapshot.featuredChaseHeat"
          :featured-chase-label="snapshot.featuredChaseLabel"
          :language="language"
        />

        <div class="spectator-now__stage">
          <div
            v-if="outcomeSlots.length"
            class="spectator-wheel-frame"
          >
            <div class="wheel-outer">
              <div class="wheel-disc">
                <canvas
                  :id="SPECTATOR_WHEEL_CANVAS_ID"
                  class="wheel-canvas"
                ></canvas>
                <div
                  class="wheel-center-cap"
                  aria-hidden="true"
                >
                  <div
                    class="wheel-center-cap__icon"
                    :style="{ transform: `rotate(${centerCapAngle}rad)` }"
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M12 2L13.09 8.26L20 12L13.09 15.74L12 22L10.91 15.74L4 12L10.91 8.26L12 2Z"></path>
                    </svg>
                  </div>
                </div>
              </div>
              <div
                class="wheel-pointer"
                aria-hidden="true"
              ></div>
            </div>
          </div>

          <div
            class="spectator-result"
            :style="{ '--spectator-result-color': latestResultColor }"
          >
            <div class="spectator-result__meta">
              <span class="spectator-result__eyebrow">{{ t('spectatorLatestResultLabel') }}</span>
              <strong>{{ snapshot.isSpinning ? t('spectatorLiveLabel') : t('spectatorSettledLabel') }}</strong>
            </div>
            <div class="spectator-result__subcopy">{{ latestResultSubcopy }}</div>
            <a
              v-if="snapshot.fairnessVerificationUrl"
              class="spectator-result__proof"
              :href="snapshot.fairnessVerificationUrl"
              target="_blank"
              rel="noopener noreferrer"
            >{{ t('spectatorVerifyThisResult') }}</a>
          </div>
        </div>
      </section>

      <SpectatorRecentResults
        :entries="snapshot.recentFairnessHistory"
        :language="language"
      />
      <SpectatorPrizeBoard
        :chase-board="snapshot.chaseBoard"
        :featured-chase-heat="snapshot.featuredChaseHeat"
        :language="language"
      />
      <SpectatorTrustCard
        :reveal-text="t('spectatorRevealTextSpin')"
        :fairness-verification-url="snapshot.fairnessVerificationUrl"
        :language="language"
      />
    </div>
  </div>
</template>
