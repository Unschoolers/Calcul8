<script setup lang="ts">
defineProps<{
  revealText: string;
  fairnessVerificationUrl: string | null;
}>();
</script>

<template>
  <section class="spectator-card spectator-trust">
    <div class="spectator-card__eyebrow">Trust</div>
    <p class="spectator-subtitle">
      The result is committed before it lands, then revealed after the {{ revealText }} so anyone can verify it.
    </p>
    <ol class="spectator-trust__steps">
      <li>The proof is locked before the result finishes.</li>
      <li>The winning result is revealed after the {{ revealText }}.</li>
      <li>Anyone can open the proof page and verify the outcome.</li>
    </ol>
    <a
      v-if="fairnessVerificationUrl"
      class="spectator-reel__verify"
      :href="fairnessVerificationUrl"
      target="_blank"
      rel="noopener noreferrer"
    >Open the latest proof</a>
  </section>
</template>

