<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppDialogShell from "../../ui/AppDialogShell.vue";
import type { ShopifyVariantSearchResult } from "../../../types/app.ts";
import type { ShopifyDraftPreview } from "../../../domain/shopify-draft.ts";
import ShopifyCreateDraftDialog from "./ShopifyCreateDraftDialog.vue";

const props = defineProps<{
  query: string;
  results: ShopifyVariantSearchResult[];
  loading: boolean;
  completed: boolean;
  hasMore: boolean;
  selectedVariantId: string | null;
  selectedLocationId: string | null;
  error: string | null;
  disabled: boolean;
  t: (key: string) => string;
  canCreateDraft?: boolean;
  createDraftDisabled?: boolean;
  loadDraftPreview?: () => Promise<ShopifyDraftPreview>;
  createDraft?: (locationId: string, previewToken: string) => Promise<void>;
}>();

const emit = defineEmits<{
  (event: "query-change", value: string): void;
  (event: "load-more"): void;
  (event: "confirm", value: { variantId: string; locationId: string }): void;
  (event: "cancel", value: { variantId: string | null; locationId: string | null; product: ShopifyVariantSearchResult | null }): void;
}>();

const isOpen = ref(false);
const isCreateDraftOpen = ref(false);
const draftVariantId = ref<string | null>(null);
const draftLocationId = ref<string | null>(null);
const originalSelection = ref<{ variantId: string | null; locationId: string | null; product: ShopifyVariantSearchResult | null }>({ variantId: null, locationId: null, product: null });
const selectedResult = computed(() => props.results.find((result) => result.variantId === props.selectedVariantId) ?? null);
const draftResult = computed(() => props.results.find((result) => result.variantId === draftVariantId.value)
  ?? (originalSelection.value.variantId === draftVariantId.value ? originalSelection.value.product : null));
const resultLocation = computed(() => draftResult.value?.locations.find((location) => location.id === draftLocationId.value) ?? null);
const canConfirm = computed(() => !props.disabled && !!draftResult.value && !!resultLocation.value);

watch(isOpen, (open) => {
  if (!open) return;
  const product = props.results.find((result) => result.variantId === props.selectedVariantId) ?? null;
  originalSelection.value = { variantId: props.selectedVariantId, locationId: props.selectedLocationId, product };
  draftVariantId.value = props.selectedVariantId;
  draftLocationId.value = props.selectedLocationId;
});
watch(() => props.query, (query, previousQuery) => {
  if (isOpen.value && query !== previousQuery) {
    draftVariantId.value = null;
    draftLocationId.value = null;
  }
});

function closePicker(): void {
  if (!isOpen.value) return;
  emit("cancel", originalSelection.value);
  isOpen.value = false;
}

function chooseVariant(variantId: string): void {
  if (props.disabled) return;
  const result = props.results.find((item) => item.variantId === variantId);
  draftVariantId.value = result?.variantId ?? null;
  draftLocationId.value = result?.locations.length === 1 ? result.locations[0]!.id : null;
}

function chooseLocation(locationId: string): void {
  if (props.disabled || !draftResult.value?.locations.some((location) => location.id === locationId)) return;
  draftLocationId.value = locationId;
}

function useProduct(): void {
  if (!canConfirm.value || !draftVariantId.value || !draftLocationId.value) return;
  emit("confirm", { variantId: draftVariantId.value, locationId: draftLocationId.value });
  isOpen.value = false;
}
</script>

<template>
  <section class="shopify-product-picker-entry" :aria-label="t('configShopifySectionTitle')">
    <div class="text-subtitle-2 mb-2">{{ t('configShopifySectionTitle') }}</div>
    <div v-if="selectedResult" class="shopify-product-picker-summary mb-3" data-testid="shopify-picker-selected-summary">
      <div class="font-weight-medium" style="overflow-wrap: anywhere">{{ selectedResult.title }}</div>
      <div class="text-caption text-medium-emphasis" style="overflow-wrap: anywhere">{{ selectedResult.variantTitle }}</div>
      <div class="text-caption text-medium-emphasis" style="overflow-wrap: anywhere">{{ t('configShopifyBindingSku') }}: {{ selectedResult.sku || t('configShopifyNoSku') }} · {{ selectedResult.price }}</div>
      <div class="text-caption text-medium-emphasis">{{ t('configShopifyBindingLocation') }}: {{ selectedResult.locations.find((location) => location.id === selectedLocationId)?.name || selectedLocationId }}</div>
    </div>
    <v-btn class="app-touch-target" variant="outlined" :disabled="disabled" @click="isOpen = true">
      {{ t('configShopifyPickerOpen') }}
    </v-btn>
    <div v-if="canCreateDraft && loadDraftPreview && createDraft" class="shopify-product-picker-create">
      <v-btn
        class="app-touch-target"
        color="primary"
        variant="tonal"
        :disabled="disabled || createDraftDisabled"
        @click="isCreateDraftOpen = true"
      >
        {{ t('configShopifyCreateDraft') }}
      </v-btn>
      <div v-if="createDraftDisabled && !disabled" class="text-caption text-medium-emphasis" role="note">
        {{ t('configShopifyDraftSaveFirst') }}
      </div>
      <shopify-create-draft-dialog
        v-model="isCreateDraftOpen"
        :t="t"
        :load-preview="loadDraftPreview"
        :create-draft="createDraft"
      />
    </div>

    <app-dialog-shell
      :model-value="isOpen"
      :title="t('configShopifyPickerTitle')"
      :max-width="640"
      :persistent="disabled"
      initial-focus-selector="[data-picker-close]"
      @update:model-value="(open: boolean) => { if (!open) closePicker(); }"
    >
      <template #title>
        <div class="d-flex align-center ga-2">
          <span class="flex-grow-1">{{ t('configShopifyPickerTitle') }}</span>
          <v-btn data-picker-close class="app-touch-target" icon="mdi-close" variant="text" size="small" :aria-label="t('commonClose')" :disabled="disabled" @click="closePicker"></v-btn>
        </div>
      </template>

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
      <div v-if="loading && !results.length" class="text-body-2 text-medium-emphasis mt-4" role="status">{{ t('configShopifySearching') }}</div>
      <div v-else-if="query.trim().length >= 2 && completed && !results.length && !error" class="text-body-2 text-medium-emphasis mt-4" role="status">{{ t('configShopifyNoResults') }}</div>
      <div v-else-if="query.trim().length < 2" class="text-body-2 text-medium-emphasis mt-4">{{ t('configShopifySearchMinimum') }}</div>

      <div v-else-if="results.length" class="shopify-product-picker-results mt-3" role="group" :aria-label="t('configShopifySearchResults')">
        <button
          v-for="result in results"
          :key="result.variantId"
          type="button"
          class="shopify-product-picker-result"
          :class="{ 'shopify-product-picker-result--selected': draftVariantId === result.variantId }"
          :aria-pressed="draftVariantId === result.variantId"
          :disabled="disabled"
          @click="chooseVariant(result.variantId)"
        >
          <span class="shopify-product-picker-result-title">{{ result.title }}</span>
          <span class="shopify-product-picker-result-meta">{{ result.variantTitle }}</span>
          <span class="shopify-product-picker-result-meta">{{ t('configShopifyBindingSku') }}: {{ result.sku || t('configShopifyNoSku') }}</span>
          <span class="shopify-product-picker-result-price">{{ t('configShopifyPrice') }}: {{ result.price }}</span>
        </button>
      </div>

      <v-select
        v-if="draftResult && draftResult.locations.length > 1"
        :model-value="draftLocationId"
        :items="draftResult.locations.map((location) => ({ title: `${location.name} · ${location.available ?? '—'}`, value: location.id }))"
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

      <template #actions>
        <v-spacer />
        <v-btn class="app-touch-target" variant="text" :disabled="disabled" @click="closePicker">{{ t('commonCancel') }}</v-btn>
        <v-btn class="app-touch-target" color="primary" :disabled="!canConfirm" @click="useProduct">{{ t('configShopifyUseProduct') }}</v-btn>
      </template>
    </app-dialog-shell>
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
