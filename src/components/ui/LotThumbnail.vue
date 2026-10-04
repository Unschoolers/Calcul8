<script setup lang="ts">
import { ref, watch } from "vue";
const props = withDefaults(defineProps<{ image?: string; icon?: string; size?: number }>(), { icon: "mdi-cube-outline", size: 40 });
const failed = ref(false);
watch(() => props.image, () => { failed.value = false; });
</script>

<template>
  <span class="lot-thumbnail" :class="{ 'lot-thumbnail--image': image && !failed }" :style="{ '--lot-thumbnail-size': `${size}px` }" aria-hidden="true">
    <img v-if="image && !failed" :src="image" alt="" loading="lazy" decoding="async" @error="failed = true" />
    <v-icon v-else :size="Math.min(size, 22)">{{ icon }}</v-icon>
  </span>
</template>

<style scoped>
.lot-thumbnail { width: var(--lot-thumbnail-size); height: var(--lot-thumbnail-size); flex: 0 0 var(--lot-thumbnail-size); display: inline-flex; align-items: center; justify-content: center; }
.lot-thumbnail--image { border-radius: 8px; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(var(--v-theme-on-surface), .12); overflow: hidden; }
.lot-thumbnail img { width: 100%; height: 100%; object-fit: contain; }
</style>
