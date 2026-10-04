<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppDialogShell from "../../ui/AppDialogShell.vue";
import ShopifyProductSelection from "./ShopifyProductSelection.vue";
import ShopifyDraftForm from "./ShopifyDraftForm.vue";
import ShopifyBindingDetails from "./ShopifyBindingDetails.vue";
import ShopifyLinkedStock from "./ShopifyLinkedStock.vue";
import type { ShopifyLotIntegrationProps } from "../../../domain/shopify-lot-integration.ts";
import type { ShopifyVariantSearchResult } from "../../../types/app.ts";
import { normalizeShopifyMoney, type BindingAction, type DraftOverrides } from "../../../../shared/shopify-product-manager.ts";
import { shopifySavedLotFieldsMatch, shopifyUiErrorMessage } from "../../../domain/shopify-ui-error.ts";
const props = defineProps<ShopifyLotIntegrationProps>();
const emit = defineEmits<{ (event: "close"): void; (event: "created"): void; (event: "query-change", value: string): void; (event: "load-more"): void; (event: "retry-search"): void }>();
type View = "overview" | "selection" | "location" | "create" | "unlink" | "transfer" | "discard";
const view = ref<View>("overview"), previousView = ref<View>("overview"), discardTarget = ref<"close" | "overview">("close");
const title = ref(""), price = ref(""), baseline = ref({ title: "", price: "" });
const selected = ref<{ variantId: string; locationId: string | null; product: ShopifyVariantSearchResult } | null>(null);
const selectedLocation = ref(props.state.listing?.locationId ?? "");
const pending = ref(false), error = ref(""), success = ref("");
const form = ref<InstanceType<typeof ShopifyDraftForm>>(), createMounted = ref(false);
const createStatus = ref({ pending: false, canSubmit: false, dirty: false, unresolved: false });
const listing = computed(() => props.state.listing);
const blocked = computed(() => pending.value || createStatus.value.pending || props.state.saving || props.connection.offline || !props.connection.canManage || props.connection.status !== "connected");
const unresolved = computed(() => Boolean(props.state.pendingDetailsMutation || props.state.pendingCreateMutation || props.state.pendingBindingMutation));
const detailsDirty = computed(() => title.value !== baseline.value.title || price.value !== baseline.value.price);
const fieldsReady = computed(() => Boolean(props.state.listingStatus === "loaded" && listing.value?.observedAt && listing.value.currency && listing.value.price !== undefined && props.state.bindingVersion));
const canSaveDetails = computed(() => !blocked.value && !props.state.pendingBindingMutation && !props.state.pendingCreateMutation && props.callbacks.saveDetails && (props.state.pendingDetailsMutation || (fieldsReady.value && detailsDirty.value && title.value.trim() && title.value.trim().length <= 255 && normalizeShopifyMoney(price.value))));
const savedFieldsMatch = computed(() => Boolean(props.lot.saved && shopifySavedLotFieldsMatch(props.lot.saved, { name: props.lot.draftName, externalSku: props.lot.draftSku })));
const canCreate = computed(() => !blocked.value && savedFieldsMatch.value && props.state.listingStatus === "loaded" && !listing.value && !unresolved.value);
const canRefreshListing = computed(() => !pending.value && !props.state.saving && !props.connection.offline && props.connection.status === "connected" && (!unresolved.value || Boolean(props.state.pendingBindingMutation && props.state.recovery === "refresh")));
function canRunBindingAction(action: BindingAction, selection?: { variantId?: string; locationId?: string; confirmTransfer?: boolean }): boolean {
  if (blocked.value || !props.callbacks.saveBinding || props.state.pendingDetailsMutation || props.state.pendingCreateMutation) return false;
  const attempt = props.state.pendingBindingMutation;
  return !attempt || (attempt.action === action && (attempt.variantId ?? null) === (selection?.variantId ?? null) && (attempt.locationId ?? null) === (selection?.locationId ?? null) && Boolean(attempt.confirmTransfer) === Boolean(selection?.confirmTransfer));
}
const canConfirmSelection = computed(() => {
  const attempt = props.state.pendingBindingMutation;
  const action: BindingAction = listing.value ? "replace" : "link";
  if (attempt) return attempt.action === action && canRunBindingAction(attempt.action, { ...(attempt.variantId ? { variantId: attempt.variantId } : {}), ...(attempt.locationId ? { locationId: attempt.locationId } : {}), ...(attempt.confirmTransfer ? { confirmTransfer: true } : {}) });
  return Boolean(selected.value?.locationId && canRunBindingAction(action, { variantId: selected.value.variantId, locationId: selected.value.locationId }));
});
const canSaveLocation = computed(() => {
  const attempt = props.state.pendingBindingMutation;
  if (attempt) return attempt.action === "location" && canRunBindingAction("location", { locationId: attempt.locationId });
  return Boolean(selectedLocation.value && selectedLocation.value !== listing.value?.locationId && canRunBindingAction("location", { locationId: selectedLocation.value }));
});
const heading = computed(() => props.t(({ overview: "configShopifyManageProduct", selection: listing.value ? "configShopifyReplaceProduct" : "configShopifyPickerOpen", location: "configShopifyChangeLocation", create: "shopifyDraftDialogTitle", unlink: "configShopifyRemoveLink", transfer: "configShopifyTransfer", discard: "configShopifyUnsavedChanges" } as const)[view.value]));
function resetDetails() {
  const original = props.state.pendingDetailsMutation?.draft;
  baseline.value = { title: listing.value?.productTitle ?? "", price: listing.value?.price ?? "" };
  title.value = original?.title ?? baseline.value.title; price.value = original?.price ?? baseline.value.price;
}
watch(() => [listing.value?.variantId, listing.value?.locationId, props.state.bindingVersion], () => { if (!detailsDirty.value) resetDetails(); }, { immediate: true });
watch(() => [listing.value?.productTitle, listing.value?.price], () => { if (!detailsDirty.value && !props.state.pendingDetailsMutation) resetDetails(); });
function navigate(next: View) { view.value = next; error.value = ""; if (next === "create") createMounted.value = true; void nextTick(() => document.querySelector<HTMLElement>(".shopify-manager__heading")?.focus()); }
function leave(target: "close" | "overview") {
  if (pending.value || createStatus.value.pending || props.state.saving) return;
  if (detailsDirty.value || (view.value === "create" && createStatus.value.dirty)) { previousView.value = view.value; discardTarget.value = target; navigate("discard"); return; }
  if (target === "close") emit("close"); else navigate("overview");
}
function discard() {
  if (discardTarget.value === "close") emit("close");
  else { createMounted.value = false; createStatus.value = { pending: false, canSubmit: false, dirty: false, unresolved: false }; resetDetails(); navigate("overview"); }
}
async function refresh() {
  if (!canRefreshListing.value) return;
  pending.value = true; error.value = "";
  try { await props.callbacks.refreshListing(); if (!detailsDirty.value) resetDetails(); selectedLocation.value = listing.value?.locationId ?? ""; }
  catch (failure) { error.value = shopifyUiErrorMessage(failure, props.t, "configShopifyListingLoadError"); }
  finally { pending.value = false; }
}
async function saveBinding(action: BindingAction, selection?: { variantId?: string; locationId?: string; confirmTransfer?: boolean }) {
  if (!canRunBindingAction(action, selection)) return;
  pending.value = true; error.value = ""; success.value = "";
  try {
    await props.callbacks.saveBinding(action, selection);
    success.value = props.t(action === "unlink" ? "configShopifyLinkRemoved" : "configShopifyLinkSaved");
    navigate("overview"); resetDetails();
    await props.callbacks.refreshListing(); resetDetails();
  } catch (failure) { error.value = shopifyUiErrorMessage(failure, props.t, "configShopifyLinkError"); }
  finally { pending.value = false; }
}
async function saveDetails() {
  if (!canSaveDetails.value || !props.callbacks.saveDetails || props.state.pendingBindingMutation || props.state.pendingCreateMutation) return;
  pending.value = true; error.value = ""; success.value = "";
  try {
    const result = await props.callbacks.saveDetails(props.state.pendingDetailsMutation?.draft ?? { title: title.value.trim(), price: normalizeShopifyMoney(price.value)! });
    if (result.outcome.title === "confirmed" && result.outcome.price === "confirmed") { baseline.value = { title: title.value, price: price.value }; success.value = props.t("configShopifyDetailsSaved"); }
    else error.value = props.t("configShopifyDetailsPartial");
  } catch (failure) { error.value = shopifyUiErrorMessage(failure, props.t, "configShopifyDetailsSaveError"); }
  finally { pending.value = false; }
}
async function create(overrides: DraftOverrides, previewToken: string) { await props.callbacks.createDraft(overrides, previewToken);
  try { await props.callbacks.refreshListing(); } catch { /* The creation is confirmed; the listing exposes its own refresh error. */ } }
function created() { success.value = props.t("configShopifyDraftCreated"); createMounted.value = false; createStatus.value = { pending: false, canSubmit: false, dirty: false, unresolved: false }; resetDetails(); navigate("overview"); emit("created"); }
function retryBinding() { const attempt = props.state.pendingBindingMutation; if (attempt) void saveBinding(attempt.action, { ...(attempt.variantId ? { variantId: attempt.variantId } : {}), ...(attempt.locationId ? { locationId: attempt.locationId } : {}), ...(attempt.confirmTransfer ? { confirmTransfer: true } : {}) }); }
</script>

<template>
  <AppDialogShell :model-value="true" :title="heading" :max-width="720" :persistent="pending || state.saving || createStatus.pending" initial-focus-selector=".shopify-manager__heading" @update:model-value="(value) => { if (!value) leave('close'); }">
    <template #title><div class="shopify-manager__header"><v-icon aria-hidden="true" color="primary">$shopify</v-icon><div class="shopify-manager__heading" tabindex="-1">{{ heading }}</div><v-btn class="app-touch-target" icon="mdi-close" variant="text" :aria-label="t('commonClose')" :disabled="pending || state.saving || createStatus.pending" @click="leave('close')" /></div></template>
    <div class="shopify-manager">
      <p v-if="connection.offline || connection.status !== 'connected' || state.recovery === 'reconnect'" class="text-body-2" role="note">{{ t('configShopifyReconnectInSettings') }}</p>
      <p v-if="!connection.canManage" class="text-body-2" role="note">{{ t('configShopifyWorkspaceOwnerHint') }}</p>
      <v-alert v-if="error || (state.error && state.errorOperation !== 'search')" type="error" variant="tonal" density="compact" role="alert">{{ error || state.error }}</v-alert>
      <p v-if="success" class="text-body-2 text-success mb-0" role="status">{{ success }}</p>
      <template v-if="view === 'overview'">
        <p class="text-body-2 text-medium-emphasis mb-0">{{ t('configShopifyIndependentSaveHint') }}</p>
        <v-btn v-if="state.pendingBindingMutation" class="app-touch-target" color="primary" :disabled="blocked || Boolean(state.pendingDetailsMutation || state.pendingCreateMutation)" @click="retryBinding">{{ t('configShopifyRecoverOperation') }}</v-btn>
        <v-btn v-if="state.pendingCreateMutation" class="app-touch-target" color="primary" :disabled="blocked || Boolean(state.pendingDetailsMutation || state.pendingBindingMutation)" @click="navigate('create')">{{ t('configShopifyRecoverCreate') }}</v-btn>
        <template v-if="listing">
          <div class="shopify-manager__columns">
            <div><ShopifyBindingDetails :listing="listing" :t="t" /></div>
            <section v-if="listing.mode === 'linked'" class="shopify-manager__details" :aria-label="t('configShopifyProductDetails')">
              <h3 class="text-subtitle-1">{{ t('configShopifyProductDetails') }}</h3>
              <v-text-field v-model="title" :label="t('shopifyDraftTitleLabel')" maxlength="255" variant="outlined" density="comfortable" hide-details="auto" :disabled="blocked || !fieldsReady || Boolean(state.pendingDetailsMutation)" />
              <v-text-field v-model="price" :label="t('shopifyDraftPriceLabel')" :suffix="listing.currency || ''" inputmode="decimal" variant="outlined" density="comfortable" hide-details="auto" :disabled="blocked || !fieldsReady || Boolean(state.pendingDetailsMutation)" />
              <p class="text-caption text-medium-emphasis mb-0">{{ t('configShopifySharedTitleHint') }}</p>
              <p v-if="!fieldsReady" class="text-caption mb-0">{{ t('configShopifyRefreshDetailsHint') }}</p>
              <p v-if="state.detailsOutcome" class="text-caption mb-0" role="status">{{ t('shopifyDraftTitleLabel') }}: {{ t('configShopifyOutcome' + state.detailsOutcome.title) }} · {{ t('shopifyDraftPriceLabel') }}: {{ t('configShopifyOutcome' + state.detailsOutcome.price) }}</p>
            </section>
            <section v-else class="shopify-manager__details"><h3 class="text-subtitle-1">{{ t('configShopifyManagedTitle') }}</h3><p class="text-body-2">{{ t('configShopifyManagedHint') }}</p><v-btn class="app-touch-target" variant="outlined" :disabled="blocked || unresolved" @click="navigate('transfer')">{{ t('configShopifyTransfer') }}</v-btn></section>
          </div>
          <div class="shopify-manager__secondary">
            <v-btn v-if="listing.mode === 'linked'" class="app-touch-target" variant="text" :disabled="blocked || unresolved || detailsDirty" @click="selected = null; navigate('selection')">{{ t('configShopifyReplaceProduct') }}</v-btn>
            <v-btn v-if="listing.mode === 'linked'" class="app-touch-target" variant="text" :disabled="blocked || unresolved || detailsDirty || !listing.availableLocations?.length" @click="selectedLocation = listing.locationId || ''; navigate('location')">{{ t('configShopifyChangeLocation') }}</v-btn>
            <v-btn class="app-touch-target" variant="text" color="error" :disabled="blocked || unresolved || detailsDirty" @click="navigate('unlink')">{{ t('configShopifyRemoveLink') }}</v-btn>
          </div>
          <ShopifyLinkedStock v-if="listing.mode === 'linked' && connection.status === 'connected' && !connection.offline && !pending && state.listingStatus === 'loaded'" :key="`${listing.variantId}:${listing.locationId}:${listing.inventoryItemId}`" :boxes-purchased="lot.boxesPurchased" :packs-per-box="lot.packsPerBox" :sales="lot.sales" :load-stock="callbacks.loadStock" :t="t" :language="language" :disabled="blocked" />
        </template>
        <div v-else-if="state.listingStatus === 'loaded'" class="shopify-manager__choices">
          <p class="text-body-2 mb-0">{{ t('configShopifyNotLinkedHint') }}</p>
          <v-btn class="app-touch-target" variant="outlined" prepend-icon="mdi-link-variant" :disabled="blocked || unresolved" @click="navigate('selection')">{{ t('configShopifyPickerOpen') }}</v-btn>
          <v-btn class="app-touch-target" color="primary" prepend-icon="mdi-plus" :disabled="!canCreate" @click="navigate('create')">{{ t('configShopifyCreateDraft') }}</v-btn>
          <p v-if="!savedFieldsMatch" class="text-caption mb-0">{{ t('configShopifyDraftSaveFirst') }}</p>
        </div>
        <p v-else role="status">{{ t(state.listingStatus === 'loading' ? 'configShopifyListingLoading' : 'configShopifyListingLoadError') }}</p>
      </template>
      <template v-if="view === 'selection'">
        <p class="text-body-2 mb-0">{{ t(listing ? 'configShopifyReplaceHint' : 'configShopifyLinkHint') }}</p>
        <ShopifyProductSelection :query="state.search.query" :results="state.search.results" :loading="state.search.loading" :completed="state.search.completed" :has-more="state.search.hasMore" :selected-variant-id="selected?.variantId ?? null" :selected-location-id="selected?.locationId ?? null" :selected-product="selected?.product" :error="state.errorOperation === 'search' ? state.error : null" :recovery="state.recovery" :disabled="blocked || unresolved" :language="language" :t="t" @selection="selected = $event" @query-change="emit('query-change', $event)" @load-more="emit('load-more')" @retry-search="emit('retry-search')" />
      </template>
      <ShopifyDraftForm v-if="createMounted" v-show="view === 'create'" ref="form" :load-preview="callbacks.loadPreview" :create-draft="create" :pending-attempt="state.pendingCreateMutation" :disabled="blocked || Boolean(state.pendingBindingMutation || state.pendingDetailsMutation)" :t="t" @status="createStatus = $event" @created="created" />
      <template v-if="view === 'location'"><p class="text-body-2 mb-0">{{ t('configShopifyLocationHint') }}</p><v-select v-model="selectedLocation" :items="listing?.availableLocations?.map(item => ({ title: item.name, value: item.id })) || []" :label="t('shopifyDraftLocationLabel')" variant="outlined" :disabled="blocked || Boolean(state.pendingDetailsMutation || state.pendingCreateMutation)" /></template>
      <p v-if="view === 'unlink'" class="text-body-1">{{ t('configShopifyRemoveHint') }}</p>
      <p v-if="view === 'transfer'" class="text-body-1">{{ t('configShopifyTransferHint') }}</p>
      <p v-if="view === 'discard'" class="text-body-1">{{ t(unresolved ? 'configShopifyRetainAttemptHint' : 'configShopifyDiscardHint') }}</p>
    </div>
    <template #actions>
      <template v-if="view === 'discard'"><v-btn class="app-touch-target" variant="text" @click="navigate(previousView)">{{ t('configShopifyKeepEditing') }}</v-btn><v-btn class="app-touch-target" color="primary" @click="discard">{{ t(unresolved ? 'commonClose' : 'configShopifyDiscard') }}</v-btn></template>
      <template v-else>
        <v-btn v-if="view !== 'overview'" class="app-touch-target" variant="text" :disabled="pending || state.saving || createStatus.pending" @click="leave('overview')">{{ t('configShopifyBack') }}</v-btn>
        <v-btn v-else class="app-touch-target" variant="text" :disabled="!canRefreshListing" @click="refresh">{{ t('configShopifyRefreshListing') }}</v-btn>
        <v-spacer />
        <v-btn v-if="view === 'overview' && listing?.mode === 'linked'" class="app-touch-target" color="primary" variant="flat" :disabled="!canSaveDetails" :loading="pending" @click="saveDetails">{{ t(state.pendingDetailsMutation ? 'configShopifyRecoverOperation' : 'configShopifySaveDetails') }}</v-btn>
        <v-btn v-if="view === 'selection'" class="app-touch-target" color="primary" variant="flat" :disabled="!canConfirmSelection" :loading="pending" @click="state.pendingBindingMutation ? retryBinding() : saveBinding(listing ? 'replace' : 'link', { variantId: selected!.variantId, locationId: selected!.locationId! })">{{ t(listing ? 'configShopifyConfirmReplace' : 'configShopifyConfirmLink') }}</v-btn>
        <v-btn v-if="view === 'create'" class="app-touch-target" color="primary" variant="flat" :disabled="!createStatus.canSubmit" :loading="createStatus.pending" @click="form?.submit()">{{ t(createStatus.unresolved ? 'configShopifyRecoverCreate' : 'shopifyDraftCreate') }}</v-btn>
        <v-btn v-if="view === 'location'" class="app-touch-target" color="primary" variant="flat" :disabled="!canSaveLocation" :loading="pending" @click="state.pendingBindingMutation ? retryBinding() : saveBinding('location', { locationId: selectedLocation })">{{ t('configShopifySaveLocation') }}</v-btn>
        <v-btn v-if="view === 'unlink'" class="app-touch-target" color="error" variant="flat" :disabled="!canRunBindingAction('unlink')" :loading="pending" @click="saveBinding('unlink')">{{ t('configShopifyConfirmRemove') }}</v-btn>
        <v-btn v-if="view === 'transfer'" class="app-touch-target" color="primary" variant="flat" :disabled="!canRunBindingAction('transfer', { confirmTransfer: true })" :loading="pending" @click="saveBinding('transfer', { confirmTransfer: true })">{{ t('configShopifyConfirmTransfer') }}</v-btn>
      </template>
    </template>
  </AppDialogShell>
</template>
<style scoped>
.shopify-manager { display: grid; gap: 1rem; min-width: 0; }
.shopify-manager__header { display: flex; align-items: center; width: 100%; min-width: 0; gap: .65rem; }
.shopify-manager__heading { flex: 1; font-weight: 650; min-width: 0; overflow-wrap: anywhere; }
.shopify-manager__columns { display: grid; gap: 1rem; min-width: 0; }
.shopify-manager__columns > * { min-width: 0; }
.shopify-manager__details, .shopify-manager__choices { display: grid; gap: .9rem; align-content: start; min-width: 0; }
.shopify-manager__secondary { display: flex; flex-wrap: wrap; gap: .25rem; border-block: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); padding: .5rem 0; }
.shopify-manager :deep(.v-btn__content) { white-space: normal; overflow-wrap: anywhere; text-align: center; }
@media (min-width: 700px) { .shopify-manager__columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; } }
</style>
