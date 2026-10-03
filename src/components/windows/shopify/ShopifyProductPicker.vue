<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppDialogShell from "../../ui/AppDialogShell.vue";
import type { ShopifyVariantSearchResult } from "../../../types/app.ts";
import type { ShopifyDraftPreview } from "../../../domain/shopify-draft.ts";
import ShopifyProductSelection from "./ShopifyProductSelection.vue";
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
  language?: string;
  recovery?: "retry" | "refresh" | "reconnect" | "none";
  canCreateDraft?: boolean;
  createDraftDisabled?: boolean;
  loadDraftPreview?: () => Promise<ShopifyDraftPreview>;
  createDraft?: (locationId: string, previewToken: string) => Promise<void>;
}>();

const emit = defineEmits<{
  (event: "query-change", value: string): void;
  (event: "load-more"): void;
  (event: "confirm", value: { variantId: string; locationId: string }): void;
  (event: "cancel", value: { variantId: string | null; locationId: string | null; product: ShopifyVariantSearchResult | null; query: string }): void;
  (event: "retry-search"): void;
  (event: "created"): void;
}>();

const isOpen = ref(false);
const isCreateDraftOpen = ref(false);
const createDraftEntry = ref<HTMLElement | null>(null);
const draftVariantId = ref<string | null>(null);
const draftLocationId = ref<string | null>(null);
const originalSelection = ref<{ variantId: string | null; locationId: string | null; product: ShopifyVariantSearchResult | null }>({ variantId: null, locationId: null, product: null });
const originalQuery = ref("");
const selectedResult = computed(() => props.results.find((result) => result.variantId === props.selectedVariantId) ?? null);
const draftResult = computed(() => props.results.find((result) => result.variantId === draftVariantId.value)
  ?? (originalSelection.value.variantId === draftVariantId.value ? originalSelection.value.product : null));
const resultLocation = computed(() => draftResult.value?.locations.find((location) => location.id === draftLocationId.value) ?? null);
const canConfirm = computed(() => !props.disabled && !!draftResult.value && !!resultLocation.value);

watch(isOpen, (open) => {
  if (!open) return;
  const product = props.results.find((result) => result.variantId === props.selectedVariantId) ?? null;
  originalSelection.value = { variantId: props.selectedVariantId, locationId: props.selectedLocationId, product };
  originalQuery.value = props.query;
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
  emit("cancel", { ...originalSelection.value, query: originalQuery.value });
  isOpen.value = false;
}

function formatSearchPrice(price: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return price;
  try { return new Intl.NumberFormat(props.language || "en", { maximumFractionDigits: 2 }).format(amount); }
  catch { return price; }
}

async function openDraftFromSearch(): Promise<void> {
  if (props.disabled || props.createDraftDisabled || !props.canCreateDraft || !props.loadDraftPreview || !props.createDraft) return;
  closePicker();
  await nextTick();
  if (props.disabled || props.createDraftDisabled || !props.canCreateDraft || !props.loadDraftPreview || !props.createDraft) return;
  const trigger = createDraftEntry.value?.querySelector<HTMLElement>("button.v-btn");
  if (!trigger) return;
  trigger.focus();
  isCreateDraftOpen.value = true;
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
      <div class="text-caption text-medium-emphasis" style="overflow-wrap: anywhere">{{ t('configShopifyBindingSku') }}: {{ selectedResult.sku || t('configShopifyNoSku') }} · {{ formatSearchPrice(selectedResult.price) }}</div>
      <div class="text-caption text-medium-emphasis">{{ t('configShopifyBindingLocation') }}: {{ selectedResult.locations.find((location) => location.id === selectedLocationId)?.name || selectedLocationId }}</div>
    </div>
    <v-btn class="app-touch-target" variant="outlined" :disabled="disabled" @click="isOpen = true">
      {{ t('configShopifyPickerOpen') }}
    </v-btn>
    <div v-if="canCreateDraft && loadDraftPreview && createDraft" ref="createDraftEntry" class="shopify-product-picker-create">
      <v-btn
        class="app-touch-target"
        color="primary"
        variant="tonal"
        :disabled="disabled || createDraftDisabled"
        @click="openDraftFromSearch"
      >
        {{ t('configShopifyCreateDraft') }}
      </v-btn>
      <div v-if="createDraftDisabled && !disabled" class="text-caption text-medium-emphasis" role="note">
        {{ t('configShopifyDraftSaveFirst') }}
      </div>
      <shopify-create-draft-dialog
        v-model="isCreateDraftOpen"
        :t="t"
        :language="language"
        :load-preview="loadDraftPreview"
        :create-draft="createDraft"
        @created="emit('created')"
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
          <span class="flex-grow-1 app-text-wrap shopify-product-picker-dialog-title">{{ t('configShopifyPickerTitle') }}</span>
          <v-btn data-picker-close class="app-touch-target" icon="mdi-close" variant="text" size="small" :aria-label="t('commonClose')" :disabled="disabled" @click="closePicker"></v-btn>
        </div>
      </template>

      <ShopifyProductSelection
        :query="query" :results="results" :loading="loading" :completed="completed" :has-more="hasMore"
        :selected-variant-id="draftVariantId" :selected-location-id="draftLocationId" :selected-product="originalSelection.product"
        :error="error" :recovery="recovery" :disabled="disabled" :language="language" :t="t"
        @query-change="emit('query-change', $event)" @load-more="emit('load-more')" @retry-search="emit('retry-search')"
        @selection="(selection) => { draftVariantId = selection.variantId; draftLocationId = selection.locationId; }"
      >
        <template #empty>
          <v-btn v-if="canCreateDraft && loadDraftPreview && createDraft" class="app-touch-target mt-2" variant="tonal" :disabled="disabled || createDraftDisabled" @click="openDraftFromSearch">{{ t('configShopifyCreateDraft') }}</v-btn>
        </template>
      </ShopifyProductSelection>

      <template #actions>
        <v-spacer />
        <v-btn class="app-touch-target" variant="text" :disabled="disabled" @click="closePicker">{{ t('commonCancel') }}</v-btn>
        <v-btn class="app-touch-target" color="primary" :disabled="!canConfirm" @click="useProduct">{{ t('configShopifyUseProduct') }}</v-btn>
      </template>
    </app-dialog-shell>
  </section>
</template>

<style scoped>
.shopify-product-picker-dialog-title { white-space: normal; }
.shopify-product-picker-create { display: grid; justify-items: start; gap: .4rem; margin-top: .75rem; }
</style>
