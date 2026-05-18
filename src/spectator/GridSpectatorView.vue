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
  getSpectatorBoardCells
} from "./spectatorSnapshot.ts";
import type { SpectatorPageState } from "./spectatorTypes.ts";

const props = defineProps<{
  state: Extract<SpectatorPageState, { status: "ready" }>;
}>();

const snapshot = computed(() => props.state.snapshot);
const boardCells = computed(() => getSpectatorBoardCells(snapshot.value));
const gridColumns = computed(() => Math.ceil(Math.sqrt(Math.max(1, boardCells.value.length))));
const revealedGridCount = computed(() => boardCells.value.filter((cell) => cell.revealed).length);
const gridProgressLabel = computed(() => (
  boardCells.value.length > 0 ? `${revealedGridCount.value}/${boardCells.value.length}` : "0/0"
));
const heroSubcopy = computed(() => (
  snapshot.value.sessionResultCount > 0
    ? `${gridProgressLabel.value} cells opened. ${formatHeatCopy(snapshot.value.featuredChaseHeat, snapshot.value.featuredChaseLabel)}`
    : "The grid is live. Stay here for the next verified result."
));
const latestResultLabel = computed(() => (
  String(snapshot.value.lastResultLabel || "").trim() || "Waiting for the next result"
));
const latestResultColor = computed(() => String(snapshot.value.lastResultColor || "#d4af37"));
const latestResultSubcopy = computed(() => (
  snapshot.value.sessionResultCount > 0
    ? latestResultLabel.value
    : "The next verified reveal will land here as soon as the cell opens."
));

function cellClasses(cell: (typeof boardCells.value)[number]): string[] {
  return [
    "spectator-grid-cell",
    cell.revealed ? "spectator-grid-cell--revealed" : "",
    snapshot.value.boardHighlightCellIndex === cell.index ? "spectator-grid-cell--latest" : "",
    snapshot.value.boardHighlightCellIndex === cell.index && !cell.revealed
      ? "spectator-grid-cell--highlighted"
      : ""
  ].filter(Boolean);
}

function cellStyle(cell: (typeof boardCells.value)[number]): Record<string, string> | undefined {
  return cell.revealed
    ? { "--spectator-grid-cell-color": cell.color || "#d4af37" }
    : undefined;
}
</script>

<template>
  <div class="spectator-shell">
    <section class="spectator-hero">
      <div class="spectator-kicker">Live Grid Spectator</div>
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
            {{ formatStatusLabel(snapshot, true) }}
          </div>
        </div>

        <SpectatorNowMetrics
          result-label="Reveal"
          :result-count="snapshot.sessionResultCount"
          :featured-chase-heat="snapshot.featuredChaseHeat"
          :featured-chase-label="snapshot.featuredChaseLabel"
        />

        <div class="spectator-now__stage">
          <div
            v-if="boardCells.length"
            :class="['spectator-grid-board', snapshot.boardResetAnimating === true ? 'spectator-grid-board--resetting' : '']"
            :style="{ '--spectator-grid-columns': String(gridColumns) }"
          >
            <div
              v-for="cell in boardCells"
              :key="cell.index"
              :class="cellClasses(cell)"
              :style="cellStyle(cell)"
            >
              <template v-if="cell.revealed">
                <span class="spectator-grid-cell__dot"></span>
                <span class="spectator-grid-cell__label">{{ cell.label }}</span>
              </template>
              <span
                v-else
                class="spectator-grid-cell__number"
              >{{ cell.index + 1 }}</span>
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
        reveal-text="cell opens"
        :fairness-verification-url="snapshot.fairnessVerificationUrl"
      />
    </div>
  </div>
</template>
