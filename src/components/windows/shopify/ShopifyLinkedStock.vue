<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import type { ShopifyStockObservation } from "../../../../shared/shopify-stock.ts";
import { calculateSealedBoxInventory } from "../../../domain/box-inventory.ts";
import { shopifyUiErrorMessage } from "../../../domain/shopify-ui-error.ts";

const props = defineProps<{
  boxesPurchased: number;
  packsPerBox: number;
  sales: readonly { type: string; quantity: number; packsCount: number }[];
  loadStock: () => Promise<ShopifyStockObservation>;
  t: (key: string) => string;
  language?: string;
  disabled?: boolean;
}>();
const observation = ref<ShopifyStockObservation | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const detailsOpen = ref(false);
const detailsId = `shopify-stock-details-${useId()}`;
const refreshAnnouncement = ref("");
let requestRevision = 0;
const inventory = computed(() => calculateSealedBoxInventory({ boxesPurchased: props.boxesPurchased, packsPerBox: props.packsPerBox }, props.sales));
const difference = computed(() => observation.value && inventory.value.valid ? observation.value.available - inventory.value.sealedBoxes : null);
const observedTime = computed(() => observation.value ? new Date(observation.value.observedAt).toLocaleString(props.language || undefined) : "");

async function refresh(): Promise<void> {
  if (loading.value || props.disabled) return;
  const revision = ++requestRevision;
  loading.value = true;
  error.value = null;
  refreshAnnouncement.value = "";
  try {
    const next = await props.loadStock();
    if (revision === requestRevision) {
      observation.value = next;
      refreshAnnouncement.value = props.t("configShopifyStockUpdated");
    }
  } catch (failure) {
    if (revision === requestRevision) error.value = shopifyUiErrorMessage(failure, props.t, "configShopifyStockRefreshError");
  } finally {
    if (revision === requestRevision) loading.value = false;
  }
}
onMounted(() => { void refresh(); });
onBeforeUnmount(() => { requestRevision += 1; });
</script>

<template>
  <v-card class="shopify-stock-card mb-3" variant="outlined" role="group" :aria-label="t('configShopifyStockTitle')">
    <v-card-text class="pa-3 pa-sm-4">
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
        <h3 class="text-subtitle-2 mb-0">{{ t('configShopifyStockTitle') }}</h3>
        <v-btn class="app-touch-target" size="small" variant="text" :loading="loading" :disabled="loading || disabled" @click="refresh">{{ t('configShopifyStockRefresh') }}</v-btn>
      </div>
      <div v-if="observation" class="shopify-stock-card__meta text-caption text-medium-emphasis mb-3">
        <span>{{ observation.locationName }}</span>
        <span>{{ t('configShopifyStockObservedAt') }} {{ observedTime }}</span>
      </div>
      <div v-else-if="loading" class="text-caption text-medium-emphasis mb-3" role="status">{{ t('configShopifyStockLoading') }}</div>

      <div class="shopify-stock-card__primary" role="group" :aria-label="t('configShopifyStockSummary')">
        <article class="shopify-stock-card__quantity">
          <div class="text-caption text-medium-emphasis">{{ t('configShopifyStockAvailable') }}</div>
          <strong :data-testid="`stock-value-configShopifyStockAvailable`" :aria-label="observation ? `${t('configShopifyStockAvailable')}: ${observation.available}` : `${t('configShopifyStockAvailable')}: ${t('configShopifyStockUnknown')}`">
            {{ observation ? observation.available : '—' }}
          </strong>
        </article>
        <article class="shopify-stock-card__quantity">
          <div class="text-caption text-medium-emphasis">{{ t('configShopifyStockSealed') }}</div>
          <strong data-testid="stock-value-configShopifyStockSealed" :aria-label="inventory.valid ? `${t('configShopifyStockSealed')}: ${inventory.sealedBoxes}` : `${t('configShopifyStockSealed')}: ${t('configShopifyStockUnknown')}`">
            {{ inventory.valid ? inventory.sealedBoxes : '—' }}
          </strong>
        </article>
        <article class="shopify-stock-card__quantity">
          <div class="text-caption text-medium-emphasis">{{ t('configShopifyStockDifference') }}</div>
          <strong data-testid="stock-value-configShopifyStockDifference" :aria-label="difference === null ? `${t('configShopifyStockDifference')}: ${t('configShopifyStockUnknown')}` : `${t('configShopifyStockDifference')}: ${difference > 0 ? '+' : ''}${difference}`">
            {{ difference === null ? '—' : difference > 0 ? '+' + difference : difference }}
          </strong>
        </article>
      </div>
      <p class="text-caption text-medium-emphasis mt-2 mb-2">{{ t('configShopifyStockReviewHint') }}</p>

      <v-btn class="app-touch-target shopify-stock-card__details-button" variant="text" size="small" :aria-expanded="detailsOpen" :aria-controls="detailsId" @click="detailsOpen = !detailsOpen">
        {{ t('configShopifyStockDetails') }}
        <v-icon end>{{ detailsOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
      <div :id="detailsId" v-show="detailsOpen" class="shopify-stock-card__details" :aria-label="t('configShopifyStockDetails')">
        <dl>
          <div><dt>{{ t('configShopifyStockOnHand') }}</dt><dd data-testid="stock-value-configShopifyStockOnHand">{{ observation ? observation.onHand : '—' }}</dd></div>
          <div><dt>{{ t('configShopifyStockCommitted') }}</dt><dd data-testid="stock-value-configShopifyStockCommitted">{{ observation ? observation.committed : '—' }}</dd></div>
          <div><dt>{{ t('configShopifyStockOpened') }}</dt><dd data-testid="stock-value-configShopifyStockOpened">{{ inventory.valid ? inventory.openedBoxes : '—' }}</dd></div>
          <div><dt>{{ t('configShopifyStockLoosePacks') }}</dt><dd data-testid="stock-value-configShopifyStockLoosePacks">{{ inventory.valid ? inventory.loosePacks : '—' }}</dd></div>
        </dl>
      </div>
      <div v-if="!inventory.valid" class="text-caption text-medium-emphasis mt-2">{{ t('configShopifyStockInvalidEstimate') }}</div>
      <v-alert v-if="error" type="warning" variant="tonal" density="compact" class="mt-2" role="alert">
        <div v-if="observation">{{ t('configShopifyStockStale') }}</div>
        {{ error }}
      </v-alert>
      <span v-if="refreshAnnouncement" class="shopify-stock-card__announcement" role="status" aria-live="polite">{{ refreshAnnouncement }}</span>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.shopify-stock-card { min-width: 0; }
.shopify-stock-card__meta { display: flex; flex-wrap: wrap; gap: .15rem .8rem; overflow-wrap: anywhere; }
.shopify-stock-card__primary { display: grid; grid-template-columns: minmax(0, 1fr); gap: .55rem; }
.shopify-stock-card__quantity { min-width: 0; padding: .7rem .75rem; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: .65rem; background: rgb(var(--v-theme-surface)); overflow-wrap: anywhere; }
.shopify-stock-card__quantity strong { display: block; margin-top: .2rem; font-size: 1.25rem; line-height: 1.3; font-variant-numeric: tabular-nums; }
.shopify-stock-card__details-button { max-width: 100%; white-space: normal; }
.shopify-stock-card__details dl { display: grid; grid-template-columns: minmax(0, 1fr); gap: .35rem .8rem; margin: .35rem 0 0; }
.shopify-stock-card__details dl > div { display: flex; justify-content: space-between; gap: .6rem; min-width: 0; padding: .45rem 0; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.shopify-stock-card__details dt { overflow-wrap: anywhere; }
.shopify-stock-card__details dd { margin: 0; font-variant-numeric: tabular-nums; }
.shopify-stock-card__announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (min-width: 600px) {
  .shopify-stock-card__primary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .shopify-stock-card__details dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
