<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BracketSpectatorView from "./BracketSpectatorView.vue";
import GridSpectatorView from "./GridSpectatorView.vue";
import SpectatorEmptyState from "./SpectatorEmptyState.vue";
import WheelSpectatorView from "./WheelSpectatorView.vue";
import {
  getDefaultSpectatorLanguage,
  resolveSpectatorLanguage,
  translateSpectatorMessage,
  type SpectatorLanguage
} from "./spectatorI18n.ts";
import { getSpectatorBoardCells } from "./spectatorSnapshot.ts";
import type { SpectatorPageState } from "./spectatorTypes.ts";

const props = defineProps<{
  state: SpectatorPageState;
  initialLanguage?: string;
}>();

const language = ref<SpectatorLanguage>(
  resolveSpectatorLanguage(props.initialLanguage || getDefaultSpectatorLanguage())
);
const readyState = computed(() => (props.state.status === "ready" ? props.state : null));
const t = (key: string, params?: Record<string, string | number | null | undefined>) =>
  translateSpectatorMessage(language.value, key, params);

watch(
  () => props.initialLanguage,
  (nextLanguage) => {
    if (nextLanguage) {
      language.value = resolveSpectatorLanguage(nextLanguage);
    }
  }
);

function setLanguage(nextLanguage: SpectatorLanguage): void {
  language.value = nextLanguage;
}

const emptyCopy = computed(() => {
  if (props.state.status === "loading") {
    return {
      title: t("spectatorLoadingTitle"),
      body: t("spectatorLoadingBody")
    };
  }
  if (props.state.status === "not_found") {
    return {
      title: t("spectatorNotFoundTitle"),
      body: t("spectatorNotFoundBody")
    };
  }
  return {
    title: t("spectatorErrorTitle"),
    body: t("spectatorErrorBody")
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
  <div class="spectator-page">
    <div
      class="spectator-language-toggle"
      role="group"
      :aria-label="t('spectatorLanguageLabel')"
    >
      <button
        type="button"
        :class="['spectator-language-toggle__button', language === 'en' ? 'spectator-language-toggle__button--active' : '']"
        :aria-pressed="language === 'en'"
        @click="setLanguage('en')"
      >
        {{ t('spectatorLanguageEnglish') }}
      </button>
      <button
        type="button"
        :class="['spectator-language-toggle__button', language === 'fr-CA' ? 'spectator-language-toggle__button--active' : '']"
        :aria-pressed="language === 'fr-CA'"
        @click="setLanguage('fr-CA')"
      >
        {{ t('spectatorLanguageFrench') }}
      </button>
    </div>
    <component
      :is="readyComponent"
      v-if="readyState && readyComponent"
      :state="readyState"
      :language="language"
    />
    <SpectatorEmptyState
      v-else
      :title="emptyCopy.title"
      :body="emptyCopy.body"
      :language="language"
    />
  </div>
</template>
