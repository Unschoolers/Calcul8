<script setup lang="ts">
import { ref, watch } from "vue";
import AppDialogShell from "../../ui/AppDialogShell.vue";
import ShopifyDraftForm from "./ShopifyDraftForm.vue";
import type { ShopifyDraftPreview } from "../../../domain/shopify-draft.ts";
import type { DraftOverrides } from "../../../../shared/shopify-product-manager.ts";
const props = defineProps<{ modelValue: boolean; t: (key: string) => string; language?: string; loadPreview: () => Promise<ShopifyDraftPreview>; createDraft: (locationId: string, previewToken: string) => Promise<void> }>();
const emit = defineEmits<{ (event: "update:modelValue", value: boolean): void; (event: "created"): void }>();
const form = ref<InstanceType<typeof ShopifyDraftForm>>();
const status = ref({ pending: false, canSubmit: false });
function close() { if (!status.value.pending) emit("update:modelValue", false); }
function create(overrides: DraftOverrides, previewToken: string) { return props.createDraft(overrides.locationId, previewToken); }
function created() { status.value.pending = false; emit("created"); emit("update:modelValue", false); }
watch(() => props.modelValue, value => { if (!value && status.value.pending) emit("update:modelValue", true); });
</script>
<template>
  <AppDialogShell :model-value="modelValue" :title="t('shopifyDraftDialogTitle')" :persistent="status.pending" :max-width="720" initial-focus-selector=".shopify-draft-dialog__heading" @update:model-value="(value) => { if (!value) close(); }">
    <template #title><div class="shopify-draft-dialog__title"><div class="shopify-draft-dialog__heading" tabindex="-1">{{ t('shopifyDraftDialogTitle') }}</div><v-btn class="app-touch-target" icon="mdi-close" variant="text" :disabled="status.pending" :aria-label="t('commonClose')" @click="close" /></div></template>
    <ShopifyDraftForm v-if="modelValue" ref="form" :load-preview="loadPreview" :create-draft="create" :editable="false" :language="language" :t="t" @status="status = $event" @created="created" />
    <template #actions><v-spacer /><v-btn class="app-touch-target" :disabled="status.pending" variant="text" @click="close">{{ t('commonClose') }}</v-btn><v-btn class="app-touch-target" color="primary" :disabled="!status.canSubmit" :loading="status.pending" @click="form?.submit()">{{ t('shopifyDraftCreate') }}</v-btn></template>
  </AppDialogShell>
</template>
<style scoped>
.shopify-draft-dialog__title { display: flex; align-items: center; gap: .5rem; min-width: 0; width: 100%; }
.shopify-draft-dialog__heading { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
</style>
