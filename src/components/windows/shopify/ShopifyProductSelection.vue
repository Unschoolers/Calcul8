<script setup lang="ts">
import { computed } from "vue";
import type { ShopifyVariantSearchResult } from "../../../types/app.ts";
import type { Recovery } from "../../../domain/shopify-ui-error.ts";
const props = defineProps<{
  query: string; results: ShopifyVariantSearchResult[]; loading: boolean; completed: boolean; hasMore: boolean;
  selectedVariantId: string | null; selectedLocationId: string | null;
  selectedProduct?: ShopifyVariantSearchResult | null; error: string | null; recovery?: Recovery;
  disabled: boolean; language?: string; t: (key: string) => string;
}>();
const emit = defineEmits<{
  (event: "query-change", value: string): void;
  (event: "load-more"): void;
  (event: "retry-search"): void;
  (event: "selection", value: { variantId: string; locationId: string | null; product: ShopifyVariantSearchResult }): void;
}>();
const selectedResult = computed(() => props.results.find(result => result.variantId === props.selectedVariantId)
  ?? (props.selectedProduct?.variantId === props.selectedVariantId ? props.selectedProduct : null));
function chooseVariant(variantId: string): void {
  if (props.disabled) return;
  const product = props.results.find(item => item.variantId === variantId);
  if (product) emit("selection", { variantId, locationId: product.locations.length === 1 ? product.locations[0]!.id : null, product });
}
function chooseLocation(locationId: string): void {
  const product = selectedResult.value;
  if (!props.disabled && product?.locations.some(location => location.id === locationId)) emit("selection", { variantId: product.variantId, locationId, product });
}
function formatSearchPrice(price: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return price;
  try { return new Intl.NumberFormat(props.language || "en", { maximumFractionDigits: 2 }).format(amount); } catch { return price; }
}
</script>

<template>
  <section class="shopify-product-selection">
      <v-text-field
        :model-value="query"
        :label="t('configShopifySearchLabel')"
        variant="outlined"
        density="comfortable"
        clearable
        hide-details="auto"
        :loading="loading"
        :disabled="disabled"
        @update:model-value="(value: string | null) => emit('query-change', value ?? '')"
      />

      <div v-if="error" class="text-body-2 text-error mt-3" role="alert">{{ error }}</div>
      <div v-if="recovery === 'reconnect'" class="text-caption text-medium-emphasis mt-2">{{ t('configShopifyReconnectInSettings') }}</div>
      <div v-else-if="error && (recovery === 'retry' || recovery === 'refresh')" class="mt-2">
        <v-btn class="app-touch-target" size="small" variant="text" :disabled="disabled || loading" @click="emit('retry-search')">{{ t('configShopifyRetry') }}</v-btn>
      </div>
      <div v-if="loading && !results.length" class="text-body-2 text-medium-emphasis mt-4" role="status">{{ t('configShopifySearching') }}</div>
      <div v-else-if="query.trim().length >= 2 && completed && !results.length && !error" class="text-body-2 text-medium-emphasis mt-4" role="status">
        {{ t('configShopifyNoResults') }}
        <slot name="empty" />

      </div>
      <div v-else-if="query.trim().length < 2" class="text-body-2 text-medium-emphasis mt-4">{{ t('configShopifySearchMinimum') }}</div>

      <div v-else-if="results.length" class="shopify-product-picker-results mt-3" role="group" :aria-label="t('configShopifySearchResults')">
        <button
          v-for="result in results"
          :key="result.variantId"
          type="button"
          class="shopify-product-picker-result"
          :class="{ 'shopify-product-picker-result--selected': selectedVariantId === result.variantId }"
          :aria-pressed="selectedVariantId === result.variantId"
          :disabled="disabled"
          @click="chooseVariant(result.variantId)"
        >
          <span class="shopify-product-picker-result-title">{{ result.title }}</span>
          <span class="shopify-product-picker-result-meta">{{ result.variantTitle }}</span>
          <span class="shopify-product-picker-result-meta">{{ t('configShopifyBindingSku') }}: {{ result.sku || t('configShopifyNoSku') }}</span>
          <span class="shopify-product-picker-result-price">{{ t('configShopifyPrice') }}: {{ formatSearchPrice(result.price) }}</span>
        </button>
      </div>

      <v-select
        v-if="selectedResult && selectedResult.locations.length > 1"
        :model-value="selectedLocationId"
        :items="selectedResult.locations.map((location) => ({ title: `${location.name} · ${location.available ?? '—'}`, value: location.id }))"
        :label="t('configShopifyLocationLabel')"
        variant="outlined"
        density="comfortable"
        class="mt-4"
        :disabled="disabled"
        @update:model-value="(value: string | null) => chooseLocation(value ?? '')"
      />

      <div v-if="hasMore" class="d-flex justify-center mt-2">
        <v-btn class="app-touch-target" variant="text" :loading="loading" :disabled="loading || disabled" @click="emit('load-more')">{{ t('configShopifyLoadMore') }}</v-btn>
      </div>


  </section>
</template>
<style scoped>


.shopify-product-picker-results {
  display: grid;
  gap: 0.5rem;
}

.shopify-product-picker-create {
  display: grid;
  justify-items: start;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.shopify-product-picker-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  width: 100%;
  min-width: 0;
  padding: 0.75rem 0.875rem;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.5rem;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.shopify-product-picker-result--selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.shopify-product-picker-result:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.shopify-product-picker-result-title {
  width: 100%;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.shopify-product-picker-result-meta,
.shopify-product-picker-result-price {
  width: 100%;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.shopify-product-picker-result-meta {
  color: rgba(var(--v-theme-on-surface), 0.72);
}
</style>
