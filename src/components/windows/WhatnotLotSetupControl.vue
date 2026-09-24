<script setup lang="ts">
import { computed } from "vue";
import { resolveEffectiveWhatnotFeeInput, type WhatnotFeePeriodSummary } from "../../app-core/shared/whatnot-fee-summary.ts";
import type { AdditionalFeeAppliesTo, WhatnotVertical } from "../../types/app.ts";

const props = defineProps<{
  vertical: WhatnotVertical | null;
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
  <v-card variant="tonal" class="whatnot-lot-setup mb-3">
    <v-card-text>
      <v-select :model-value="vertical" :items="verticalItems" :label="t('configWhatnotVerticalLabel')" variant="outlined" density="compact" hide-details @update:model-value="emit('update:vertical', $event)" />
      <v-alert v-if="vertical === null" type="warning" density="compact" variant="tonal" class="mt-2">{{ t('configWhatnotVerticalLegacyHint') }}</v-alert>
      <section v-if="status" class="whatnot-fee-status mt-3" :aria-label="t('configWhatnotFeeStatusTitle')">
        <h4>{{ t('configWhatnotFeeStatusTitle') }}</h4>
        <p>{{ t('configWhatnotFeeStatusRate', { rate: status.rate, tier: status.tier }) }}</p>
        <p>{{ t('configWhatnotFeeStatusPreviousGross', { amount: status.previousGross.toLocaleString(), start: status.previousStart, end: status.previousEnd }) }}</p>
        <p v-if="status.nextThreshold">{{ t('configWhatnotFeeStatusProgress', { amount: status.currentGross.toLocaleString(), threshold: status.nextThreshold.toLocaleString(), start: status.periodStart, end: status.periodEnd }) }}</p>
        <p v-else>{{ t('configWhatnotFeeStatusMaxTier', { start: status.periodStart, end: status.periodEnd }) }}</p>
        <v-progress-linear v-if="status.nextThreshold" :model-value="status.progress" color="secondary" rounded height="6" class="mb-2" />
        <p class="mb-1">{{ t('configWhatnotFeeStatusEstimate') }}</p>
        <p v-if="status.incomplete" class="mb-0">{{ t('configWhatnotFeeStatusIncomplete') }}</p>
      </section>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.whatnot-lot-setup { border-color: rgba(var(--v-theme-secondary), .28); }
.whatnot-fee-status p { margin: 0 0 .35rem; }
</style>
