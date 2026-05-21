<script setup lang="ts">
import { translateSpectatorMessage } from "./spectatorI18n.ts";

const props = defineProps<{
  title: string;
  body: string;
  language: string;
}>();

const t = (key: string) => translateSpectatorMessage(props.language, key);
</script>

<template>
  <div class="spectator-shell">
    <section class="spectator-card spectator-empty">
      <div class="spectator-kicker">{{ t('spectatorGameKicker') }}</div>
      <h1 class="spectator-empty__title">{{ title }}</h1>
      <p class="spectator-empty__body">{{ body }}</p>
    </section>
  </div>
</template>
