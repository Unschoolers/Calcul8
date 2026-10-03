<script setup lang="ts">
import { computed } from "vue";
import type { ShopifyLotLink } from "../../../domain/shopify-binding-summary.ts";

const props = defineProps<{ link: ShopifyLotLink; t: (key: string) => string }>();
const label = computed(() => [
  props.t(props.link.mode === "managed" ? "shopifyLotManaged" : "shopifyLotLinked"),
  ...(props.link.disconnected ? [props.t("shopifyLotDisconnected")] : props.link.stale ? [props.t("shopifyLotStale")] : []),
  ...(props.link.attention ? [props.t("shopifyLotAttention")] : [])
].join(". "));
</script>

<template>
  <span class="shopify-link-indicator" :class="{ 'shopify-link-indicator--stale': link.stale }" role="img" :aria-label="label" :title="label">
    <v-icon icon="mdi-shopify" size="18" aria-hidden="true" />
    <v-icon v-if="link.attention" icon="mdi-alert-circle-outline" size="14" color="warning" aria-hidden="true" />
  </span>
</template>

<style scoped>
.shopify-link-indicator { display: inline-flex; align-items: center; gap: .15rem; flex: 0 0 auto; color: rgb(var(--v-theme-primary)); vertical-align: middle; }
.shopify-link-indicator--stale { color: rgba(var(--v-theme-on-surface), .6); }
</style>
