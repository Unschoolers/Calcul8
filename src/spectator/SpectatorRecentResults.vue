<script setup lang="ts">
import { formatRelativeTime } from "./spectatorFormatting.ts";
import { translateSpectatorMessage } from "./spectatorI18n.ts";
import type { GameSpectatorSnapshot } from "../types/app.ts";

const props = defineProps<{
  entries: GameSpectatorSnapshot["recentFairnessHistory"];
  language: string;
}>();

const t = (key: string, params?: Record<string, string | number | null | undefined>) =>
  translateSpectatorMessage(props.language, key, params);
</script>

<template>
  <section class="spectator-card">
    <div class="spectator-card__eyebrow">{{ t('spectatorRecentLabel') }}</div>
    <div class="spectator-reel">
      <article
        v-for="entry in entries"
        :key="`${entry.spinNumber}:${entry.timestamp}`"
        class="spectator-reel__item"
      >
        <div class="spectator-reel__top">
          <div class="spectator-reel__spin">{{ t('spectatorResultNumber', { count: entry.spinNumber }) }}</div>
          <div>{{ formatRelativeTime(entry.timestamp, language) }}</div>
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
        >{{ t('spectatorOpenProof') }}</a>
      </article>
      <div
        v-if="!entries.length"
        class="spectator-empty"
      >
        <p class="spectator-empty__body">{{ t('spectatorWaitingFirstVerified') }}</p>
      </div>
    </div>
  </section>
</template>
