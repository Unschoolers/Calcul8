<script setup lang="ts">
import { formatHeatLabel } from "./spectatorFormatting.ts";
import { translateSpectatorMessage } from "./spectatorI18n.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";

const props = defineProps<{
  resultLabel: string;
  resultCount: number;
  featuredChaseHeat: GameSpectatorSnapshot["featuredChaseHeat"];
  featuredChaseLabel: GameSpectatorSnapshot["featuredChaseLabel"];
  language: string;
}>();

const t = (key: string) => translateSpectatorMessage(props.language, key);
</script>

<template>
  <div class="spectator-now__summary">
    <div class="spectator-now__metric">
      <span class="spectator-now__metric-label">{{ resultLabel }}</span>
      <strong class="spectator-now__metric-value">#{{ resultCount }}</strong>
    </div>
    <div :class="['spectator-now__metric', `spectator-now__metric--heat-${featuredChaseHeat || 'low'}`]">
      <span class="spectator-now__metric-label">{{ t('spectatorHeatLabel') }}</span>
      <strong class="spectator-now__metric-value">{{ formatHeatLabel(featuredChaseHeat, language) }}</strong>
    </div>
    <div class="spectator-now__metric spectator-now__metric--accent">
      <span class="spectator-now__metric-label">{{ t('spectatorWatchingLabel') }}</span>
      <strong class="spectator-now__metric-value">{{ featuredChaseLabel || t('spectatorPrizeBoardFallback') }}</strong>
    </div>
  </div>
</template>
