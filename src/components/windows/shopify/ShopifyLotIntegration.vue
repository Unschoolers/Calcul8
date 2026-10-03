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
    <div class="shopify-integration-card__summary"><v-icon color="primary" aria-hidden="true" size="26">mdi-shopify</v-icon><div class="shopify-integration-card__copy"><h3 class="text-subtitle-2">{{ t('configShopifySectionTitle') }}</h3><p class="text-body-2 mb-0">{{ subtitle }}</p><span v-if="state.listing" class="text-caption text-medium-emphasis">{{ t(state.listing.mode === 'managed' ? 'configShopifyManagedTitle' : 'configShopifyLinkedTitle') }}<template v-if="state.listing.price && state.listing.currency"> · {{ state.listing.price }} {{ state.listing.currency }}</template></span></div></div>
    <v-btn ref="trigger" class="app-touch-target" variant="tonal" color="primary" @click="show">{{ t('configShopifyManageProduct') }}</v-btn>
  </section>
  <ShopifyLotManager v-if="open" v-bind="props" @close="close" @created="emit('created')" @query-change="emit('query-change', $event)" @load-more="emit('load-more')" @retry-search="emit('retry-search')" />
</template>
<style scoped>
.shopify-integration-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 1rem; margin-top: .75rem; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: .75rem; background: rgba(var(--v-theme-on-surface), .025); }
.shopify-integration-card__summary { display: flex; align-items: flex-start; min-width: 0; flex: 1 1 12rem; gap: .75rem; }
.shopify-integration-card__copy { min-width: 0; overflow-wrap: anywhere; }
.shopify-integration-card :deep(.v-btn__content) { white-space: normal; }
@media (max-width: 400px) { .shopify-integration-card > .v-btn { width: 100%; } }
</style>
