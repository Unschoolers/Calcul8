<script setup lang="ts">
defineProps<{
  label: string;
  disabled: boolean;
  activatorProps?: Record<string, unknown>;
}>();
</script>

<template>
  <v-fab v-bind="activatorProps" icon="mdi-cart-plus" color="primary" size="large" extended
    :title="label" :aria-label="label" :disabled="disabled">{{ label }}</v-fab>
</template>
