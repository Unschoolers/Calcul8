<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { ShopifyLotIntegrationProps } from "../../../domain/shopify-lot-integration.ts";
import ShopifyLotManager from "./ShopifyLotManager.vue";
const props = defineProps<ShopifyLotIntegrationProps>();
const emit = defineEmits<{ (event: "manager-open", value: boolean): void; (event: "query-change", value: string): void; (event: "load-more"): void; (event: "created"): void; (event: "retry-search"): void }>();
const open = ref(false), trigger = ref<{ $el: HTMLElement }>();
const subtitle = computed(() => props.state.listing ? props.state.listing.productTitle || props.state.listing.productId : props.t(props.state.listingStatus === "loaded" ? "configShopifyNotLinked" : props.state.listingStatus === "loading" ? "configShopifyListingLoading" : "configShopifyListingLoadError"));
function show() { open.value = true; emit("manager-open", true); }
async function close() { open.value = false; emit("manager-open", false); await nextTick(); trigger.value?.$el?.focus(); }
</script>
<template>
  <section class="shopify-integration-card" :aria-label="t('configShopifySectionTitle')">
    <div class="shopify-integration-card__summary">
      <v-icon color="primary" aria-hidden="true" size="22">$shopify</v-icon>
      <div class="shopify-integration-card__copy">
        <h3 class="shopify-integration-card__label">{{ t('configShopifySectionTitle') }}</h3>
        <p class="shopify-integration-card__product">{{ subtitle }}</p>
        <div v-if="state.listing" class="shopify-integration-card__meta">
          <span>{{ t(state.listing.mode === 'managed' ? 'configShopifyManagedTitle' : 'configShopifyLinkedTitle') }}</span>
          <span v-if="state.listing.price && state.listing.currency" class="shopify-integration-card__price">{{ state.listing.price }} {{ state.listing.currency }}</span>
        </div>
      </div>
    </div>
    <v-btn ref="trigger" class="app-touch-target" variant="tonal" color="primary" :aria-label="t('configShopifyManageProduct')" @click="show">{{ t('configShopifyManageAction') }}</v-btn>
  </section>
  <ShopifyLotManager v-if="open" v-bind="props" @close="close" @created="emit('created')" @query-change="emit('query-change', $event)" @load-more="emit('load-more')" @retry-search="emit('retry-search')" />
</template>
<style scoped>
.shopify-integration-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: var(--app-space-3); padding: var(--app-space-3); border: var(--app-stroke-hairline) solid var(--app-stroke-subtle); border-radius: var(--app-radius-lg); background: var(--app-surface-muted); }
.shopify-integration-card__summary { display: flex; align-items: flex-start; min-width: 0; gap: var(--app-space-2); }
.shopify-integration-card__summary > .v-icon { flex: 0 0 auto; margin-top: .1rem; }
.shopify-integration-card__copy { min-width: 0; overflow-wrap: anywhere; }
.shopify-integration-card__label { margin: 0 0 var(--app-space-1); font-size: var(--app-font-size-caption); font-weight: var(--app-font-weight-strong); color: var(--app-text-subtle); }
.shopify-integration-card__product { margin: 0; font-size: var(--app-font-size-body-sm); font-weight: var(--app-font-weight-strong); line-height: var(--app-line-height-normal); }
.shopify-integration-card__meta { display: flex; flex-wrap: wrap; gap: var(--app-space-1) var(--app-space-2); margin-top: var(--app-space-1); color: var(--app-text-subtle); font-size: var(--app-font-size-caption); }
.shopify-integration-card__price { white-space: nowrap; }
.shopify-integration-card :deep(.v-btn__content) { white-space: normal; }
</style>
