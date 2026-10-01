<script lang="ts">
import { defineComponent, type PropType } from "vue";
import AppDialogShell from "../../ui/AppDialogShell.vue";
import { isShopifyDraftPreview, type ShopifyDraftPreview } from "../../../domain/shopify-draft.ts";

export default defineComponent({
  name: "ShopifyCreateDraftDialog",
  components: { AppDialogShell },
  props: {
    modelValue: { type: Boolean, default: false },
    t: { type: Function as PropType<(key: string) => string>, required: true },
    loadPreview: { type: Function as PropType<() => Promise<ShopifyDraftPreview>>, required: true },
    createDraft: { type: Function as PropType<(locationId: string, previewToken: string) => Promise<void>>, required: true }
  },
  emits: ["update:modelValue"],
  data(): {
    preview: ShopifyDraftPreview | null;
    selectedLocationId: string;
    isLoadingPreview: boolean;
    isCreating: boolean;
    error: "preview" | "create" | null;
    errorMessage: string;
    requestRevision: number;
  } {
    return {
      preview: null,
      selectedLocationId: "",
      isLoadingPreview: false,
      isCreating: false,
      error: null,
      errorMessage: "",
      requestRevision: 0
    };
  },
  computed: {
    isOpen: {
      get(): boolean { return this.modelValue; },
      set(value: boolean): void { this.setOpen(value); }
    },
    canCreate(): boolean {
      return Boolean(this.preview && this.selectedLocationId && !this.isLoadingPreview && !this.isCreating);
    },
    locationItems(): Array<{ title: string; value: string }> {
      return (this.preview?.locations ?? []).map(location => ({ title: location.name, value: location.id }));
    }
  },
  watch: {
    modelValue: {
      immediate: true,
      handler(open: boolean, wasOpen: boolean | undefined): void {
        if (open && !wasOpen) void this.fetchPreview();
        if (!open && wasOpen) {
          if (this.isCreating) {
            this.$emit("update:modelValue", true);
            return;
          }
          this.requestRevision += 1;
          this.preview = null;
          this.selectedLocationId = "";
          this.error = null;
          this.isLoadingPreview = false;
        }
      }
    }
  },
  beforeUnmount(): void {
    this.requestRevision += 1;
  },
  methods: {
    setOpen(value: boolean): void {
      if (!value && this.isCreating) return;
      this.$emit("update:modelValue", value);
    },
    async fetchPreview(): Promise<void> {
      const revision = ++this.requestRevision;
      this.preview = null;
      this.selectedLocationId = "";
      this.error = null;
      this.errorMessage = "";
      this.isLoadingPreview = true;
      try {
        const response = await this.loadPreview();
        if (revision !== this.requestRevision || !this.modelValue) return;
        if (!isShopifyDraftPreview(response)) throw new Error("Invalid Shopify draft preview");
        this.preview = response;
        if (response.locations.length === 1) this.selectedLocationId = response.locations[0].id;
      } catch (error) {
        if (revision === this.requestRevision && this.modelValue) {
          this.error = "preview";
          this.errorMessage = error instanceof Error && error.message ? error.message : this.t("shopifyDraftLoadError");
        }
      } finally {
        if (revision === this.requestRevision) this.isLoadingPreview = false;
      }
    },
    async submitCreate(): Promise<void> {
      if (!this.canCreate || !this.preview) return;
      const revision = this.requestRevision;
      const selectedLocationId = this.selectedLocationId;
      const previewToken = this.preview.previewToken;
      this.error = null;
      this.errorMessage = "";
      this.isCreating = true;
      try {
        await this.createDraft(selectedLocationId, previewToken);
        if (revision === this.requestRevision && this.modelValue) this.$emit("update:modelValue", false);
      } catch (error) {
        if (revision === this.requestRevision && this.modelValue) {
          this.error = "create";
          this.errorMessage = error instanceof Error && error.message ? error.message : this.t("shopifyDraftCreateError");
        }
      } finally {
        this.isCreating = false;
      }
    }
  }
});
</script>

<template>
  <app-dialog-shell
    v-model="isOpen"
    :title="t('shopifyDraftDialogTitle')"
    :persistent="isCreating"
    :initial-focus-selector="'.shopify-draft-dialog__heading'"
    :max-width="560"
  >
    <template #title>
      <div class="shopify-draft-dialog__title">
        <div class="shopify-draft-dialog__heading" tabindex="-1">{{ t('shopifyDraftDialogTitle') }}</div>
        <v-btn
          icon
          variant="text"
          size="small"
          :disabled="isCreating"
          :aria-label="t('commonClose')"
          :title="t('commonClose')"
          @click="setOpen(false)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
    </template>

    <v-card-text class="shopify-draft-dialog__body">
      <div v-if="isLoadingPreview" role="status">{{ t('shopifyDraftLoading') }}</div>
      <v-alert v-else-if="error === 'preview'" type="error" variant="tonal" role="alert">
        {{ errorMessage || t('shopifyDraftLoadError') }}
        <v-btn variant="text" :disabled="isCreating" @click="fetchPreview">{{ t('shopifyDraftRefreshPreview') }}</v-btn>
      </v-alert>
      <div v-else-if="preview" class="shopify-draft-preview">
        <dl class="shopify-draft-preview__fields">
          <div><dt>{{ t('shopifyDraftTitleLabel') }}</dt><dd>{{ preview.title }}</dd></div>
          <div><dt>{{ t('shopifyDraftVariantLabel') }}</dt><dd>{{ preview.variantTitle }}</dd></div>
          <div><dt>{{ t('shopifyDraftSkuLabel') }}</dt><dd>{{ preview.sku }}</dd></div>
          <div><dt>{{ t('shopifyDraftPriceLabel') }}</dt><dd>{{ preview.price }} {{ preview.currency }}</dd></div>
          <div><dt>{{ t('shopifyDraftQuantityLabel') }}</dt><dd>{{ preview.quantity }}</dd></div>
        </dl>
        <v-select
          v-model="selectedLocationId"
          :items="locationItems"
          :label="t('shopifyDraftLocationLabel')"
          :disabled="isCreating"
          variant="outlined"
          density="comfortable"
          hide-details
        ></v-select>
        <v-alert type="info" variant="tonal" density="compact">{{ t('shopifyDraftNotPublished') }}</v-alert>
        <v-alert type="info" variant="tonal" density="compact">{{ t('shopifyDraftFutureStock') }}</v-alert>
        <v-alert v-if="error === 'create'" type="error" variant="tonal" role="alert">
          {{ errorMessage || t('shopifyDraftCreateError') }}
          <v-btn variant="text" :disabled="isCreating" @click="fetchPreview">{{ t('shopifyDraftRefreshPreview') }}</v-btn>
        </v-alert>
      </div>
    </v-card-text>

    <template #actions>
      <v-spacer></v-spacer>
      <v-btn :disabled="isCreating" variant="text" @click="setOpen(false)">{{ t('commonClose') }}</v-btn>
      <v-btn color="primary" :disabled="!canCreate" :loading="isCreating" @click="submitCreate">
        {{ t('shopifyDraftCreate') }}
      </v-btn>
    </template>
  </app-dialog-shell>
</template>

<style scoped>
.shopify-draft-dialog__title { display: flex; align-items: center; gap: .5rem; min-width: 0; width: 100%; }
.shopify-draft-dialog__heading { flex: 1; min-width: 0; font-weight: 600; }
.shopify-draft-dialog__body { display: grid; gap: 1rem; }
.shopify-draft-preview { display: grid; gap: 1rem; }
.shopify-draft-preview__fields { display: grid; gap: .65rem; margin: 0; }
.shopify-draft-preview__fields > div { display: grid; grid-template-columns: minmax(8rem, 1fr) minmax(0, 2fr); gap: .75rem; }
.shopify-draft-preview__fields dt { color: rgba(var(--v-theme-on-surface), .68); }
.shopify-draft-preview__fields dd { margin: 0; overflow-wrap: anywhere; }
</style>
