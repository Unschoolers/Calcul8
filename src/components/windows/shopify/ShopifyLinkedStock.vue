<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ShopifyStockObservation } from "../../../../shared/shopify-stock.ts";
import { calculateSealedBoxInventory } from "../../../domain/box-inventory.ts";

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
let requestRevision = 0;
const inventory = computed(() => calculateSealedBoxInventory({ boxesPurchased: props.boxesPurchased, packsPerBox: props.packsPerBox }, props.sales));
const difference = computed(() => observation.value && inventory.value.valid ? observation.value.available - inventory.value.sealedBoxes : null);
const observedTime = computed(() => observation.value ? new Date(observation.value.observedAt).toLocaleString(props.language || undefined) : "");

async function refresh(): Promise<void> {
  if (loading.value || props.disabled) return;
  const revision = ++requestRevision;
  loading.value = true;
  error.value = null;
  try {
    const next = await props.loadStock();
    if (revision === requestRevision) observation.value = next;
  } catch (failure) {
    if (revision === requestRevision) error.value = failure instanceof Error ? failure.message : props.t("configShopifyStockRefreshError");
  } finally {
    if (revision === requestRevision) loading.value = false;
  }
}
onMounted(() => { void refresh(); });
onBeforeUnmount(() => { requestRevision += 1; });
</script>

<template>
  <section class="mb-3" :aria-label="t('configShopifyStockTitle')">
    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-2">{{ t('configShopifyStockTitle') }}</span>
      <v-btn class="app-touch-target" size="small" variant="text" :loading="loading" :disabled="loading || disabled" @click="refresh">{{ t('configShopifyStockRefresh') }}</v-btn>
    </div>
    <div v-if="observation" class="text-caption text-medium-emphasis">{{ observation.locationName }} · {{ t('configShopifyStockObservedAt') }} {{ observedTime }}</div>
    <div v-else-if="loading" class="text-caption text-medium-emphasis" role="status">{{ t('configShopifyStockLoading') }}</div>
    <v-table density="compact">
      <tbody>
        <tr><td>{{ t('configShopifyStockAvailable') }}</td><td class="text-end">{{ observation?.available ?? '—' }}</td></tr>
        <tr><td>{{ t('configShopifyStockOnHand') }}</td><td class="text-end">{{ observation?.onHand ?? '—' }}</td></tr>
        <tr><td>{{ t('configShopifyStockCommitted') }}</td><td class="text-end">{{ observation?.committed ?? '—' }}</td></tr>
        <tr><td>{{ t('configShopifyStockSealed') }}</td><td class="text-end">{{ inventory.valid ? inventory.sealedBoxes : '—' }}</td></tr>
        <tr><td>{{ t('configShopifyStockOpened') }}</td><td class="text-end">{{ inventory.valid ? inventory.openedBoxes : '—' }}</td></tr>
        <tr><td>{{ t('configShopifyStockLoosePacks') }}</td><td class="text-end">{{ inventory.valid ? inventory.loosePacks : '—' }}</td></tr>
        <tr><td>{{ t('configShopifyStockDifference') }}</td><td class="text-end">{{ difference === null ? '—' : difference > 0 ? '+' + difference : difference }}</td></tr>
      </tbody>
    </v-table>
    <p class="text-caption text-medium-emphasis mt-2">{{ t('configShopifyStockComparisonHint') }}</p>
    <div v-if="!inventory.valid" class="text-caption text-medium-emphasis">{{ t('configShopifyStockInvalidEstimate') }}</div>
    <v-alert v-if="error" type="warning" variant="tonal" density="compact" class="mt-2" role="status">
      <div v-if="observation">{{ t('configShopifyStockStale') }}</div>
      {{ error }}
    </v-alert>
  </section>
</template>
