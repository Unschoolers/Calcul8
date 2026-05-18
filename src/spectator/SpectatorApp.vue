<script setup lang="ts">
import { computed } from "vue";
import BracketSpectatorView from "./BracketSpectatorView.vue";
import GridSpectatorView from "./GridSpectatorView.vue";
import SpectatorEmptyState from "./SpectatorEmptyState.vue";
import WheelSpectatorView from "./WheelSpectatorView.vue";
import { getSpectatorBoardCells } from "./spectatorSnapshot.ts";
import type { SpectatorPageState } from "./spectatorTypes.ts";

const props = defineProps<{
  state: SpectatorPageState;
}>();

const readyState = computed(() => (props.state.status === "ready" ? props.state : null));

const emptyCopy = computed(() => {
  if (props.state.status === "loading") {
    return {
      title: "Loading the game",
      body: "Pulling the latest spectator snapshot..."
    };
  }
  if (props.state.status === "not_found") {
    return {
      title: "Session not found",
      body: "This spectator link is missing or has already been cleared."
    };
  }
  return {
    title: "Could not load the game",
    body: "Refresh in a moment to try again."
  };
});

const readyComponent = computed(() => {
  const state = readyState.value;
  if (!state) return null;
  if (state.snapshot.gameType === "bracket") return BracketSpectatorView;
  if (state.snapshot.gameType === "grid" || getSpectatorBoardCells(state.snapshot).length > 0) {
    return GridSpectatorView;
  }
  return WheelSpectatorView;
});
</script>

<template>
  <component
    :is="readyComponent"
    v-if="readyState && readyComponent"
    :state="readyState"
  />
  <SpectatorEmptyState
    v-else
    :title="emptyCopy.title"
    :body="emptyCopy.body"
  />
</template>
