<script setup lang="ts">
import { formatRelativeTime } from "./spectatorFormatting.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";

defineProps<{
  entries: GameSpectatorSnapshot["recentFairnessHistory"];
}>();
</script>

<template>
  <section class="spectator-card">
    <div class="spectator-card__eyebrow">Recent</div>
    <div class="spectator-reel">
      <article
        v-for="entry in entries"
        :key="`${entry.spinNumber}:${entry.timestamp}`"
        class="spectator-reel__item"
      >
        <div class="spectator-reel__top">
          <div class="spectator-reel__spin">Result #{{ entry.spinNumber }}</div>
          <div>{{ formatRelativeTime(entry.timestamp) }}</div>
        </div>
        <div class="spectator-reel__label">
          <span
            class="spectator-result__dot"
            :style="{ background: entry.color }"
          ></span>
          {{ entry.label }}
        </div>
        <a
          v-if="entry.verificationUrl"
          class="spectator-reel__verify"
          :href="entry.verificationUrl"
          target="_blank"
          rel="noopener noreferrer"
        >Open proof</a>
      </article>
      <div
        v-if="!entries.length"
        class="spectator-empty"
      >
        <p class="spectator-empty__body">Waiting for the first verified result.</p>
      </div>
    </div>
  </section>
</template>

