<script setup lang="ts">
import { formatHeatLabel } from "./spectatorFormatting.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";

defineProps<{
  resultLabel: string;
  resultCount: number;
  featuredChaseHeat: GameSpectatorSnapshot["featuredChaseHeat"];
  featuredChaseLabel: GameSpectatorSnapshot["featuredChaseLabel"];
}>();
</script>

<template>
  <div class="spectator-now__summary">
    <div class="spectator-now__metric">
      <span class="spectator-now__metric-label">{{ resultLabel }}</span>
      <strong class="spectator-now__metric-value">#{{ resultCount }}</strong>
    </div>
    <div :class="['spectator-now__metric', `spectator-now__metric--heat-${featuredChaseHeat || 'low'}`]">
      <span class="spectator-now__metric-label">Heat</span>
      <strong class="spectator-now__metric-value">{{ formatHeatLabel(featuredChaseHeat) }}</strong>
    </div>
    <div class="spectator-now__metric spectator-now__metric--accent">
      <span class="spectator-now__metric-label">Watching</span>
      <strong class="spectator-now__metric-value">{{ featuredChaseLabel || "Prize board" }}</strong>
    </div>
  </div>
</template>

