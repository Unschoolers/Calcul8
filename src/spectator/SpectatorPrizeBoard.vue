<script setup lang="ts">
import type { GameSpectatorSnapshot } from "../types/app.ts";

defineProps<{
  chaseBoard: GameSpectatorSnapshot["chaseBoard"];
  featuredChaseHeat: GameSpectatorSnapshot["featuredChaseHeat"];
}>();
</script>

<template>
  <section class="spectator-card">
    <div class="spectator-card__eyebrow">Prizes</div>
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
            {{ entry.status === "live" ? "Live" : "Claimed" }}
          </div>
        </div>
        <div class="spectator-chase__meta">
          <span class="spectator-pill">Hits {{ entry.hitCount }}</span>
          <span class="spectator-pill">Chance {{ Math.round(Number(entry.slots || 0)) }}%</span>
          <span
            v-if="entry.remainingHits != null"
            class="spectator-pill"
          >{{ entry.remainingHits }} hit{{ entry.remainingHits === 1 ? "" : "s" }} left</span>
          <span
            v-if="entry.isFeatured"
            :class="['spectator-pill', `spectator-pill--heat-${featuredChaseHeat || 'low'}`]"
          >Featured prize</span>
        </div>
      </article>
      <div
        v-if="!chaseBoard.length"
        class="spectator-empty"
      >
        <p class="spectator-empty__body">No prize board is active for this game.</p>
      </div>
    </div>
  </section>
</template>

