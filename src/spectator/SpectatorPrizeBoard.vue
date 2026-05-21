<script setup lang="ts">
import { translateSpectatorMessage } from "./spectatorI18n.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";

const props = defineProps<{
  chaseBoard: GameSpectatorSnapshot["chaseBoard"];
  featuredChaseHeat: GameSpectatorSnapshot["featuredChaseHeat"];
  language: string;
}>();

const t = (key: string, params?: Record<string, string | number | null | undefined>) =>
  translateSpectatorMessage(props.language, key, params);
</script>

<template>
  <section class="spectator-card">
    <div class="spectator-card__eyebrow">{{ t('spectatorPrizesLabel') }}</div>
    <div class="spectator-chases">
      <article
        v-for="entry in chaseBoard"
        :key="entry.label"
        :class="['spectator-chase', `spectator-chase--${entry.status}`]"
      >
        <div class="spectator-chase__top">
          <div class="spectator-chase__title">
            <span
              class="spectator-result__dot"
              :style="{ background: entry.color }"
            ></span>
            {{ entry.label }}
          </div>
          <div :class="['spectator-chase__status', `spectator-chase__status--${entry.status}`]">
            {{ entry.status === "live" ? t('spectatorPrizeLive') : t('spectatorPrizeClaimed') }}
          </div>
        </div>
        <div class="spectator-chase__meta">
          <span class="spectator-pill">{{ t('spectatorHitsCount', { count: entry.hitCount }) }}</span>
          <span class="spectator-pill">{{ t('spectatorChancePercent', { percent: Math.round(Number(entry.slots || 0)) }) }}</span>
          <span
            v-if="entry.remainingHits != null"
            class="spectator-pill"
          >{{ entry.remainingHits === 1 ? t('spectatorOneHitLeft') : t('spectatorHitsLeft', { count: entry.remainingHits }) }}</span>
          <span
            v-if="entry.isFeatured"
            :class="['spectator-pill', `spectator-pill--heat-${featuredChaseHeat || 'low'}`]"
          >{{ t('spectatorFeaturedPrize') }}</span>
        </div>
      </article>
      <div
        v-if="!chaseBoard.length"
        class="spectator-empty"
      >
        <p class="spectator-empty__body">{{ t('spectatorNoPrizeBoard') }}</p>
      </div>
    </div>
  </section>
</template>
