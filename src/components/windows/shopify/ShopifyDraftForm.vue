<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { normalizeDraftOverrides, type DraftOverrides, type DraftCreateMutation } from "../../../../shared/shopify-product-manager.ts";
import { isShopifyDraftPreview, type ShopifyDraftPreview } from "../../../domain/shopify-draft.ts";
import { ShopifyUiError, ShopifyErrorCode, shopifyUiErrorMessage, shopifyUiErrorRecovery, type Recovery } from "../../../domain/shopify-ui-error.ts";

const props = withDefaults(defineProps<{
  loadPreview: (overrides?: DraftOverrides) => Promise<ShopifyDraftPreview>;
  createDraft: (overrides: DraftOverrides, previewToken: string) => Promise<void>;
  pendingAttempt?: DraftCreateMutation | null; disabled?: boolean; editable?: boolean; language?: string; t: (key: string) => string;
}>(), { editable: true });
const emit = defineEmits<{
  (event: "created"): void;
  (event: "status", value: { pending: boolean; canSubmit: boolean; dirty: boolean; unresolved: boolean }): void;
}>();
const preview = ref<ShopifyDraftPreview | null>(null);
const title = ref(props.pendingAttempt?.overrides.title ?? "");
const price = ref(props.pendingAttempt?.overrides.price ?? "");
const locationId = ref(props.pendingAttempt?.overrides.locationId ?? "");
const initialLocation = ref("");
const attempt = ref<{ overrides: DraftOverrides; previewToken: string } | null>(props.pendingAttempt ? { overrides: { ...props.pendingAttempt.overrides }, previewToken: props.pendingAttempt.previewToken } : null);
const editable = computed(() => props.editable !== false);
const recovery = ref<Recovery>("none");
const formattedPrice = computed(() => { if (!preview.value) return ""; try { return new Intl.NumberFormat(props.language || "en", { style: "currency", currency: preview.value.currency }).format(Number(preview.value.price)); } catch { return `${preview.value.price} ${preview.value.currency}`; } });
const loading = ref(false), creating = ref(false), error = ref("");
let revision = 0;
const normalized = computed(() => normalizeDraftOverrides({ title: title.value, price: price.value, locationId: locationId.value }));
const dirty = computed(() => Boolean(attempt.value || (preview.value && (title.value !== preview.value.title || price.value !== preview.value.price || locationId.value !== initialLocation.value))));
const canSubmit = computed(() => Boolean((attempt.value || normalized.value) && !loading.value && !creating.value && !props.disabled));
watch([canSubmit, dirty, creating, attempt], () => emit("status", { pending: creating.value, canSubmit: canSubmit.value, dirty: dirty.value, unresolved: Boolean(attempt.value) }), { immediate: true });

async function load(): Promise<void> {
  if (props.disabled || attempt.value) return;
  const current = ++revision; loading.value = true; error.value = "";
  try {
    const value = await props.loadPreview();
    if (current !== revision) return;
    if (!isShopifyDraftPreview(value)) throw new ShopifyUiError(null, "refresh", "configShopifyDraftInvalidResponse");
    preview.value = value; title.value = value.title; price.value = value.price;
    locationId.value = value.locations.length === 1 ? value.locations[0]!.id : ""; initialLocation.value = locationId.value;
  } catch (failure) { if (current === revision) { error.value = shopifyUiErrorMessage(failure, props.t, "shopifyDraftLoadError"); recovery.value = shopifyUiErrorRecovery(failure); } }
  finally { if (current === revision) loading.value = false; }
}
async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  const current = revision; creating.value = true; error.value = "";
  try {
    if (!attempt.value) {
      const overrides = normalized.value!;
      const final = editable.value ? await props.loadPreview(overrides) : preview.value;
      if (current !== revision) return;
      if (!isShopifyDraftPreview(final) || final.title !== overrides.title || final.price !== overrides.price || !final.locations.some(location => location.id === overrides.locationId)) throw new ShopifyUiError(null, "refresh", "configShopifyDraftInvalidResponse");
      attempt.value = { overrides: { ...overrides }, previewToken: final.previewToken };
    }
    await props.createDraft(attempt.value.overrides, attempt.value.previewToken);
    if (current !== revision) return;
    attempt.value = null; emit("created");
  } catch (failure) {
    if (current !== revision) return;
    if (failure instanceof ShopifyUiError && failure.code === ShopifyErrorCode.PREVIEW_STALE) attempt.value = null;
    error.value = shopifyUiErrorMessage(failure, props.t, "shopifyDraftCreateError"); recovery.value = shopifyUiErrorRecovery(failure);
  } finally { if (current === revision) creating.value = false; }
}
onMounted(() => { void load(); });
onBeforeUnmount(() => { ++revision; });
defineExpose({ submit });
</script>

<template>
  <section class="shopify-draft-form">
    <div v-if="loading" role="status">{{ t('shopifyDraftLoading') }}</div>
    <template v-if="preview || attempt">
      <v-text-field v-if="editable" v-model="title" :label="t('shopifyDraftTitleLabel')" variant="outlined" density="comfortable" maxlength="255" :disabled="creating || disabled || Boolean(attempt)" hide-details="auto" />
      <div class="shopify-draft-form__columns">
        <v-text-field v-if="editable" v-model="price" :label="t('shopifyDraftPriceLabel')" :suffix="preview?.currency || ''" inputmode="decimal" variant="outlined" density="comfortable" :disabled="creating || disabled || Boolean(attempt)" hide-details="auto" />
        <v-select v-model="locationId" :items="preview?.locations.map(location => ({ title: location.name, value: location.id })) || [{ title: locationId, value: locationId }]" :label="t('shopifyDraftLocationLabel')" variant="outlined" density="comfortable" :disabled="creating || disabled || Boolean(attempt)" hide-details="auto" />
      </div>
      <p v-if="!normalized" class="text-caption text-error" role="note">{{ t('configShopifyDraftFieldsRequired') }}</p>
      <dl v-if="preview" class="shopify-draft-form__summary">
        <div v-if="!editable"><dt>{{ t('shopifyDraftTitleLabel') }}</dt><dd>{{ preview.title }}</dd></div>
        <div v-if="!editable"><dt>{{ t('shopifyDraftPriceLabel') }}</dt><dd>{{ formattedPrice }}</dd></div>
        <div><dt>{{ t('shopifyDraftVariantLabel') }}</dt><dd>{{ preview.variantTitle }}</dd></div>
        <div><dt>{{ t('shopifyDraftSkuLabel') }}</dt><dd><code>{{ preview.sku }}</code></dd></div>
        <div><dt>{{ t('shopifyDraftQuantityLabel') }}</dt><dd>{{ preview.quantity }}</dd></div>
      </dl>
      <p v-if="editable" class="text-caption text-medium-emphasis mb-0" role="note">{{ t('configShopifyDraftOwnershipNote') }}</p>
      <template v-else><p class="text-caption mb-0">{{ t('shopifyDraftNotPublished') }}</p><p class="text-caption mb-0">{{ t('shopifyDraftFutureStock') }}</p></template>
    </template>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" role="alert">{{ error }}</v-alert>
    <p v-if="attempt && error" class="text-body-2 mb-0" role="note">{{ t('configShopifyRecoverCreateHint') }}</p>
    <p v-if="error && recovery === 'reconnect'" class="text-caption">{{ t('configShopifyReconnectInSettings') }}</p>
    <v-btn v-if="!preview && !attempt && error && (recovery === 'retry' || recovery === 'refresh')" class="app-touch-target" variant="text" :disabled="disabled || loading" @click="load">{{ t(recovery === 'refresh' ? 'shopifyDraftRefreshPreview' : 'configShopifyRetry') }}</v-btn>
    <v-btn v-if="!editable && attempt && error && recovery === 'retry'" class="app-touch-target" variant="text" :disabled="!canSubmit" @click="submit">{{ t('configShopifyRetry') }}</v-btn>
  </section>
</template>

<style scoped>
.shopify-draft-form { display: grid; gap: 1rem; min-width: 0; }
.shopify-draft-form__columns { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
.shopify-draft-form__summary { display: grid; gap: .65rem; margin: 0; padding: .9rem; border-radius: .5rem; background: rgba(var(--v-theme-on-surface), .04); }
.shopify-draft-form__summary > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: .75rem; }
.shopify-draft-form__summary dt { font-size: .8rem; color: rgba(var(--v-theme-on-surface), .72); }
.shopify-draft-form__summary dd { margin: 0; overflow-wrap: anywhere; }
@media (min-width: 600px) { .shopify-draft-form__columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
</style>
