<script setup lang="ts">
import { computed } from "vue";
import { resolveEffectiveWhatnotFeeInput, type WhatnotFeePeriodSummary } from "../../app-core/shared/whatnot-fee-summary.ts";
import type { AdditionalFeeAppliesTo, WhatnotVertical } from "../../types/app.ts";

const props = defineProps<{
  vertical: WhatnotVertical | null;
  showCategory?: boolean;
  feeProfilePreset: string;
  summary: WhatnotFeePeriodSummary | null;
  platformFeePercent: number;
  additionalFeePercent: number;
  additionalFeeAppliesTo: AdditionalFeeAppliesTo;
  fixedFeePerOrder: number;
  t: (key: string, params?: Record<string, unknown>) => string;
}>();
const emit = defineEmits<{ "update:vertical": [value: WhatnotVertical | null] }>();
function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
const verticalItems = computed(() => [
  { title: props.t("configWhatnotVerticalUnclassified"), value: null },
  { title: props.t("configWhatnotVerticalSports"), value: "sports" },
  { title: props.t("configWhatnotVerticalTcg"), value: "tcg" },
  { title: props.t("configWhatnotVerticalFashion"), value: "fashion" },
  { title: props.t("configWhatnotVerticalOtherCollectibles"), value: "other_collectibles" },
  { title: props.t("configWhatnotVerticalCoins"), value: "coins" },
  { title: props.t("configWhatnotVerticalOther"), value: "other" }
]);
const status = computed(() => {
  const summary = props.summary;
  if (props.feeProfilePreset !== "whatnot" || !props.vertical || !summary?.periodStart) return null;
  const effective = resolveEffectiveWhatnotFeeInput({
    feeProfilePreset: "whatnot", whatnotVertical: props.vertical,
    platformFeePercent: props.platformFeePercent, additionalFeePercent: props.additionalFeePercent,
    additionalFeeAppliesTo: props.additionalFeeAppliesTo,
    fixedFeePerOrder: props.fixedFeePerOrder
  }, summary);
  const threshold = summary.nextThresholdCad;
  return {
    rate: effective?.platformFeePercent ?? props.platformFeePercent,
    tier: summary.currentTier === 0 ? props.t("configWhatnotFeeStatusStandard") : props.t("configWhatnotFeeStatusTier", { tier: summary.currentTier }),
    previousGross: summary.previousPeriodGrossCad, currentGross: summary.currentPeriodGrossCad,
    nextThreshold: threshold, progress: threshold ? Math.min(100, summary.currentPeriodGrossCad / threshold * 100) : 100,
    periodStart: summary.periodStart, periodEnd: summary.periodEndExclusive ? addDays(summary.periodEndExclusive, -1) : null,
    previousStart: summary.previousPeriodStart,
    previousEnd: summary.previousPeriodEndExclusive ? addDays(summary.previousPeriodEndExclusive, -1) : null,
    incomplete: summary.missingLotIds.length > 0
  };
});
</script>


<template>
  <v-card v-if="showCategory !== false || status" variant="outlined" elevation="1" class="whatnot-lot-setup mb-3">
    <v-card-text>
      <template v-if="showCategory !== false">
        <v-select :model-value="vertical" :items="verticalItems" :label="t('configWhatnotVerticalLabel')" variant="outlined" density="compact" hide-details @update:model-value="emit('update:vertical', $event)" />
        <v-alert v-if="vertical === null" type="warning" density="compact" variant="tonal" class="mt-2">{{ t('configWhatnotVerticalLegacyHint') }}</v-alert>
      </template>
      <section v-if="status" class="whatnot-fee-summary" :class="{ 'mt-3': showCategory !== false }" :aria-label="t('configWhatnotFeeStatusTitle')">
        <div class="whatnot-fee-summary__top">
          <h4>{{ t('configWhatnotFeeStatusTitle') }}</h4>
          <div class="whatnot-fee-summary__rate" :aria-label="t('configWhatnotFeeStatusRate', { rate: status.rate, tier: status.tier })">
            <span>{{ status.rate }}%</span><span class="whatnot-fee-summary__tier">{{ status.tier }}</span>
          </div>
        </div>
        <p v-if="status.nextThreshold" class="whatnot-fee-summary__progress-label">
          {{ t('configWhatnotFeeStatusProgress', { amount: status.currentGross.toLocaleString(), threshold: status.nextThreshold.toLocaleString() }) }}
        </p>
        <p v-else class="whatnot-fee-summary__progress-label">{{ t('configWhatnotFeeStatusMaxTier') }}</p>
        <v-progress-linear v-if="status.nextThreshold" :model-value="status.progress" color="secondary" rounded height="5" class="whatnot-fee-summary__bar" :aria-label="t('configWhatnotFeeStatusProgressBar', { percent: Math.round(status.progress) })" />
        <p v-if="status.incomplete" class="whatnot-fee-summary__warning" role="status">{{ t('configWhatnotFeeStatusIncomplete') }}</p>
        <details class="whatnot-fee-summary__details">
          <summary>{{ t('configWhatnotFeeStatusDetails') }}</summary>
          <p>{{ t('configWhatnotFeeStatusCurrentPeriod', { start: status.periodStart, end: status.periodEnd }) }}</p>
          <p>{{ t('configWhatnotFeeStatusPreviousGross', { amount: status.previousGross.toLocaleString(), start: status.previousStart, end: status.previousEnd }) }}</p>
          <p class="mb-0">{{ t('configWhatnotFeeStatusEstimate') }}</p>
        </details>
      </section>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.whatnot-lot-setup { border-color: rgba(var(--v-theme-secondary), .36); border-top: 3px solid rgb(var(--v-theme-secondary)); background: rgb(var(--v-theme-surface)); }
.whatnot-fee-summary { min-width: 0; }
.whatnot-fee-summary__top { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
.whatnot-fee-summary h4 { margin: 0; font-size: .875rem; font-weight: 600; }
.whatnot-fee-summary__rate { display: flex; align-items: baseline; gap: .35rem; color: rgb(var(--v-theme-secondary)); font-size: 1.25rem; font-weight: 700; white-space: nowrap; }
.whatnot-fee-summary__tier { color: rgb(var(--v-theme-on-surface)); font-size: .75rem; font-weight: 500; }
.whatnot-fee-summary__progress-label { margin: .35rem 0 .2rem; font-size: .8rem; line-height: 1.35; }
.whatnot-fee-summary__bar { margin-block: .25rem .45rem; }
.whatnot-fee-summary__warning { margin: .35rem 0; color: rgb(var(--v-theme-warning)); font-size: .75rem; }
.whatnot-fee-summary__details { margin-top: .3rem; font-size: .75rem; }
.whatnot-fee-summary__details summary { color: rgb(var(--v-theme-secondary)); cursor: pointer; }
.whatnot-fee-summary__details p { margin: .35rem 0; line-height: 1.4; }
@media (max-width: 480px) {
  .whatnot-fee-summary__top { align-items: center; flex-wrap: wrap; }
  .whatnot-fee-summary h4 { flex: 1 1 auto; }
  .whatnot-fee-summary__rate { font-size: 1.125rem; }
}
</style>
