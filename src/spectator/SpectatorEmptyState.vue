<script setup lang="ts">
defineProps<{
  title: string;
  body: string;
}>();
</script>

<template>
  <div class="spectator-shell">
    <section class="spectator-card spectator-empty">
      <div class="spectator-kicker">Game Spectator</div>
      <h1 class="spectator-empty__title">{{ title }}</h1>
      <p class="spectator-empty__body">{{ body }}</p>
    </section>
  </div>
</template>

