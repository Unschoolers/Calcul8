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
import {
  getSpectatorOutcomeSlots
} from "./spectatorSnapshot.ts";
import {
  SPECTATOR_WHEEL_CANVAS_ID,
  type SpectatorPageState
} from "./spectatorTypes.ts";

const props = defineProps<{
  state: Extract<SpectatorPageState, { status: "ready" }>;
}>();

const snapshot = computed(() => props.state.snapshot);
const outcomeSlots = computed(() => getSpectatorOutcomeSlots(snapshot.value));
const heroSubcopy = computed(() => (
  snapshot.value.sessionResultCount > 0
    ? `Watching live: ${formatHeatCopy(snapshot.value.featuredChaseHeat, snapshot.value.featuredChaseLabel)}`
    : "The wheel is live. Stay here for the next verified result."
));
const latestResultColor = computed(() => String(snapshot.value.lastResultColor || "#d4af37"));
const latestResultSubcopy = computed(() => (
  snapshot.value.sessionResultCount > 0
    ? formatHeatCopy(snapshot.value.featuredChaseHeat, snapshot.value.featuredChaseLabel)
    : "The next verified result will land here as soon as the wheel spins."
));
const centerCapAngle = computed(() => (
  Number.isFinite(snapshot.value.gameCurrentAngle) ? snapshot.value.gameCurrentAngle : 0
));
</script>

<template>
  <div class="spectator-shell">
    <section class="spectator-hero">
      <div class="spectator-kicker">Live Wheel Spectator</div>
      <p class="spectator-subtitle spectator-subtitle--hero">{{ heroSubcopy }}</p>
    </section>

    <div class="spectator-grid">
      <section class="spectator-card spectator-now">
        <div :class="['spectator-now__glow', `spectator-now__glow--${snapshot.featuredChaseHeat || 'low'}`]"></div>
        <div class="spectator-now__header">
          <div>
            <div class="spectator-card__eyebrow">Now</div>
            <div class="spectator-now__headline">Current moment</div>
          </div>
          <div :class="['spectator-status', `spectator-status--${formatStatusTone(snapshot)}`]">
            {{ formatStatusLabel(snapshot, false) }}
          </div>
        </div>

        <SpectatorNowMetrics
          result-label="Spin"
          :result-count="snapshot.sessionResultCount"
          :featured-chase-heat="snapshot.featuredChaseHeat"
          :featured-chase-label="snapshot.featuredChaseLabel"
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
              <span class="spectator-result__eyebrow">Latest result</span>
              <strong>{{ snapshot.isSpinning ? "Live" : "Settled" }}</strong>
            </div>
            <div class="spectator-result__subcopy">{{ latestResultSubcopy }}</div>
            <a
              v-if="snapshot.fairnessVerificationUrl"
              class="spectator-result__proof"
              :href="snapshot.fairnessVerificationUrl"
              target="_blank"
              rel="noopener noreferrer"
            >Verify this result</a>
          </div>
        </div>
      </section>

      <SpectatorRecentResults :entries="snapshot.recentFairnessHistory" />
      <SpectatorPrizeBoard
        :chase-board="snapshot.chaseBoard"
        :featured-chase-heat="snapshot.featuredChaseHeat"
      />
      <SpectatorTrustCard
        reveal-text="spin"
        :fairness-verification-url="snapshot.fairnessVerificationUrl"
      />
    </div>
  </div>
</template>
