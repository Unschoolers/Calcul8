<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { ShopifyLotIntegrationProps } from "../../../domain/shopify-lot-integration.ts";
import { shopifySavedLotFieldsMatch } from "../../../domain/shopify-ui-error.ts";
import ShopifyProductPicker from "./ShopifyProductPicker.vue";
import ShopifyBindingDetails from "./ShopifyBindingDetails.vue";
import ShopifyLinkedStock from "./ShopifyLinkedStock.vue";

const props = defineProps<ShopifyLotIntegrationProps>();
const emit = defineEmits<{
  (event: "query-change", value: string): void;
  (event: "load-more"): void;
  (event: "confirm", value: { variantId: string; locationId: string }): void;
  (event: "cancel", value: { variantId: string | null; locationId: string | null; product: import("../../../types/app.ts").ShopifyVariantSearchResult | null; query: string }): void;
  (event: "created"): void;
  (event: "retry-search"): void;
  (event: "retry-save"): void;
}>();

const success = ref(false);
const refreshingAfterCreate = ref(false);
const sessionRevision = ref(0);
const savedFieldsMatch = computed(() => Boolean(props.lot.saved && shopifySavedLotFieldsMatch(props.lot.saved, { name: props.lot.draftName, externalSku: props.lot.draftSku })));
const canCreateDraft = computed(() => Boolean(props.lot.saved && props.lot.type === "bulk" && props.connection.status === "connected" && !props.connection.offline &&
  props.connection.canManage && props.state.listingStatus === "loaded" && !props.state.listing));
const pickerDisabled = computed(() => props.state.saving || props.connection.offline || !props.connection.canManage);
const pendingLinkError = computed(() => Boolean(!props.state.listing && props.state.listingStatus === "loaded" && props.state.errorOperation === "link" && props.state.error));

onBeforeUnmount(() => { sessionRevision.value += 1; });

async function createDraft(locationId: string, previewToken: string): Promise<void> {
  const revision = sessionRevision.value;
  // Gate stock before the root mutation can install the listing and trigger a render.
  refreshingAfterCreate.value = true;
  try {
    await props.callbacks.createDraft(locationId, previewToken);
    if (revision !== sessionRevision.value) return;
    success.value = true;
    emit("created");
    // The section stays mounted while the picker disappears and refreshes provider status.
    await props.callbacks.refreshListing();
  } finally { if (revision === sessionRevision.value) refreshingAfterCreate.value = false; }
}

function retryListing(): void {
  const listingRecovery = props.state.errorOperation === "listing" && (props.state.recovery === "retry" || props.state.recovery === "refresh");
  const linkConflictRecovery = props.state.errorOperation === "link" && props.state.recovery === "refresh";
  if (!props.state.saving && !props.connection.offline && props.connection.status === "connected" && (listingRecovery || linkConflictRecovery)) void props.callbacks.refreshListing();
}

function retrySave(): void {
  if (!props.state.saving && !props.connection.offline && props.connection.status === "connected" && props.connection.canManage && props.state.errorOperation === "link" && props.state.recovery === "retry") emit("retry-save");
}
</script>

<template>
  <section class="shopify-lot-integration mt-3" :aria-label="t('configShopifySectionTitle')">
    <div v-if="state.listingStatus === 'loading' && !state.listing" class="text-caption text-medium-emphasis mb-3" role="status">{{ t('configShopifyListingLoading') }}</div>
    <v-alert v-else-if="state.listingStatus === 'error'" type="error" density="compact" variant="tonal" class="mb-3" role="alert">
      {{ state.error || t('configShopifyListingLoadError') }}
      <div v-if="state.errorOperation === 'listing' && state.recovery === 'reconnect'" class="text-caption mt-2">{{ t('configShopifyReconnectInSettings') }}</div>
      <v-btn v-else-if="state.errorOperation === 'listing' && (state.recovery === 'retry' || state.recovery === 'refresh')" class="app-touch-target" size="small" variant="text" :disabled="state.saving || connection.offline || connection.status !== 'connected'" @click="retryListing">{{ state.recovery === 'retry' ? t('configShopifyRetry') : t('configShopifyRefreshListing') }}</v-btn>
    </v-alert>

    <ShopifyBindingDetails v-if="state.listing" :listing="state.listing" :t="t" />
    <v-alert v-if="state.listing && state.error && state.listingStatus !== 'error'" type="error" density="compact" variant="tonal" class="mt-2" role="alert">{{ state.error }}</v-alert>
    <v-alert v-if="pendingLinkError" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
      {{ state.error }}
      <div v-if="state.recovery === 'reconnect'" class="text-caption mt-2">{{ t('configShopifyReconnectInSettings') }}</div>
      <v-btn v-else-if="state.recovery === 'retry'" class="app-touch-target mt-2" size="small" variant="text" :disabled="state.saving || connection.offline || connection.status !== 'connected' || !connection.canManage" @click="retrySave">{{ t('configShopifyRetrySave') }}</v-btn>
      <v-btn v-else-if="state.recovery === 'refresh'" class="app-touch-target mt-2" size="small" variant="text" :disabled="state.saving || connection.offline || connection.status !== 'connected'" @click="retryListing">{{ t('configShopifyRefreshListing') }}</v-btn>
    </v-alert>
    <div v-if="success" class="text-body-2 text-success mt-2" role="status">{{ t('configShopifyDraftCreated') }}</div>
    <ShopifyLinkedStock
      v-if="state.listing?.mode === 'linked' && connection.status === 'connected' && !refreshingAfterCreate && state.listingStatus !== 'loading'"
      :key="`${state.listing.variantId}:${state.listing.locationId ?? ''}:${state.listing.inventoryItemId ?? ''}`"
      :boxes-purchased="lot.boxesPurchased" :packs-per-box="lot.packsPerBox" :sales="lot.sales"
      :load-stock="callbacks.loadStock" :t="t" :language="language" :disabled="state.saving"
    />

    <template v-if="!state.listing && state.listingStatus === 'loaded' && connection.status === 'connected' && lot.type !== 'singles'">
      <div v-if="!connection.canManage" class="text-caption text-medium-emphasis mb-2" role="note">{{ t('configShopifyWorkspaceOwnerHint') }}</div>
      <ShopifyProductPicker
        :query="state.search.query"
        :results="state.search.results"
        :loading="state.search.loading"
        :completed="state.search.completed"
        :has-more="state.search.hasMore"
        :selected-variant-id="state.search.selectedVariantId"
        :selected-location-id="state.search.selectedLocationId"
        :error="state.errorOperation === 'search' ? state.error : null"
        :recovery="state.errorOperation === 'search' ? state.recovery : 'none'"
        :disabled="pickerDisabled"
        :can-create-draft="canCreateDraft"
        :create-draft-disabled="Boolean(lot.saved) && !savedFieldsMatch"
        :load-draft-preview="callbacks.loadPreview"
        :create-draft="createDraft"
        :language="language"
        :t="t"
        @query-change="emit('query-change', $event)"
        @load-more="emit('load-more')"
        @retry-search="emit('retry-search')"
        @confirm="emit('confirm', $event)"
        @cancel="emit('cancel', $event)"
      />
    </template>
  </section>
</template>
