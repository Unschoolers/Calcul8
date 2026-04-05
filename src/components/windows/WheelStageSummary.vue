<script lang="ts">
import { WheelStageSummary } from "./WheelStageSummary.ts";

export default WheelStageSummary;
</script>

<template src="./WheelStageSummary.html"></template>

<style>
.wheel-stage-summary {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.wheel-stage-summary--compact {
  grid-template-columns: 1fr;
}

.wheel-stage-summary-card {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid var(--wheel-soft-row-border);
  background: var(--wheel-soft-row-bg);
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.wheel-stage-summary-card__label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.wheel-stage-summary-card__value {
  font-size: 1.12rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.wheel-stage-summary-card__meta {
  font-size: 0.74rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.wheel-stage-summary-card--hero {
  text-align: left;
  align-items: flex-start;
  gap: 6px;
}

@media (max-width: 760px) {
  .wheel-stage-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .wheel-stage-summary-card {
    padding: 10px 8px;
    border-radius: 16px;
    text-align: center;
    align-items: center;
    gap: 3px;
  }

  .wheel-stage-summary-card__label {
    font-size: 0.56rem;
    letter-spacing: 0.06em;
  }

  .wheel-stage-summary-card__value {
    font-size: 0.98rem;
  }

  .wheel-stage-summary-card__meta {
    display: none;
  }
}
</style>
