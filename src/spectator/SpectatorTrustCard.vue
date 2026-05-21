<script setup lang="ts">
import { translateSpectatorMessage } from "./spectatorI18n.ts";

const props = defineProps<{
  revealText: string;
  fairnessVerificationUrl: string | null;
  language: string;
}>();

const t = (key: string, params?: Record<string, string | number | null | undefined>) =>
  translateSpectatorMessage(props.language, key, params);
</script>

<template>
  <section class="spectator-card spectator-trust">
    <div class="spectator-card__eyebrow">{{ t('spectatorTrustLabel') }}</div>
    <p class="spectator-subtitle">
      {{ t('spectatorTrustBody', { revealText }) }}
    </p>
    <ol class="spectator-trust__steps">
      <li>{{ t('spectatorTrustStepLocked') }}</li>
      <li>{{ t('spectatorTrustStepRevealed', { revealText }) }}</li>
      <li>{{ t('spectatorTrustStepVerify') }}</li>
    </ol>
    <a
      v-if="fairnessVerificationUrl"
      class="spectator-reel__verify"
      :href="fairnessVerificationUrl"
      target="_blank"
      rel="noopener noreferrer"
    >{{ t('spectatorOpenLatestProof') }}</a>
  </section>
</template>
