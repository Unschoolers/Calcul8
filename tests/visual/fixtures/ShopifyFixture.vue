<script setup lang="ts">
import { reactive } from "vue";
import { translateAppMessage } from "../../../src/app-core/i18n/index.ts";
import { calculateSealedBoxInventory } from "../../../src/domain/box-inventory.ts";
import AppDialogShell from "../../../src/components/ui/AppDialogShell.vue";
import AppFormLayout from "../../../src/components/ui/AppFormLayout.vue";
import ShopifyLotIntegration from "../../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import type { ShopifyLotIntegrationProps } from "../../../src/domain/shopify-lot-integration.ts";

const props = defineProps<{ language: string; longTitle: boolean; scenario: string }>();
const t = (key: string) => translateAppMessage(props.language, key);
const linked = props.scenario === "linked";
const longTitle = props.longTitle;
const longProductTitle = "A product title with an intentionally unbroken supercalifragilisticexpialidociouslongwordthatexceedsmobilewidth";
const longSku = "SHOPIFY-UNBROKEN-SKU-LONG-WORD-0123456789";
const state = reactive<ShopifyLotIntegrationProps["state"]>({
  listing: linked ? {
    mode: "linked",
    shop: "cards.myshopify.com",
    productId: "gid://shopify/Product/100",
    variantId: "gid://shopify/ProductVariant/101",
    productTitle: longTitle ? longProductTitle : "A saved card display",
    productStatus: "ACTIVE",
    variantTitle: longTitle ? "A variant title with an intentionally unbroken supercalifragilisticvariantlabel" : "Sealed box",
    sku: longTitle ? longSku : "CARD-001",
    inventoryItemId: "gid://shopify/InventoryItem/102",
    locationId: "gid://shopify/Location/1",
    locationName: longTitle ? "Montréalwarehousewithanintentionallyunbrokenlocationname" : "Montréal warehouse"
  } : null,
  listingStatus: "loaded",
  error: null,
  errorOperation: null,
  recovery: "none",
  saving: false,
  search: {
    query: "",
    results: longTitle ? [{
      productId: "gid://shopify/Product/200",
      variantId: "gid://shopify/ProductVariant/201",
      title: longProductTitle,
      variantTitle: "Collector edition",
      sku: longSku,
      price: "24.00",
      locations: [{ id: "gid://shopify/Location/2", name: "Montréal warehouse", available: 8 }]
    }] : [],
    loading: false,
    completed: false,
    hasMore: false,
    selectedVariantId: null,
    selectedLocationId: null
  }
});
const lot = reactive<ShopifyLotIntegrationProps["lot"]>({
  type: "bulk",
  saved: { name: "A saved card display", externalSku: "CARD-001" },
  draftName: "A saved card display",
  draftSku: "CARD-001",
  boxesPurchased: 10,
  packsPerBox: 24,
  sales: [{ type: "pack", quantity: 48, packsCount: 48 }]
});
const sealedInventory = calculateSealedBoxInventory(
  { boxesPurchased: lot.boxesPurchased, packsPerBox: lot.packsPerBox },
  lot.sales
);
const callbacks: ShopifyLotIntegrationProps["callbacks"] = {
  async loadPreview() {
    return {
      title: "A saved card display",
      variantTitle: "Sealed box",
      sku: "CARD-001",
      price: "24.00",
      currency: "CAD",
      quantity: sealedInventory.valid ? sealedInventory.sealedBoxes : 0,
      locations: [{ id: "gid://shopify/Location/1", name: "Montréal warehouse" }],
      previewToken: "a".repeat(64)
    };
  },
  async createDraft(locationId) {
    state.listing = {
      mode: "linked",
      shop: "cards.myshopify.com",
      productId: "gid://shopify/Product/300",
      variantId: "gid://shopify/ProductVariant/301",
      productTitle: "A saved card display",
      variantTitle: "Sealed box",
      sku: "CARD-001",
      inventoryItemId: "gid://shopify/InventoryItem/302",
      locationId,
      locationName: "Montréal warehouse"
    };
    state.listingStatus = "loaded";
  },
  async refreshListing() {
    if (state.listing?.mode === "linked" && state.listing.productId === "gid://shopify/Product/300") {
      state.listing = { ...state.listing, productStatus: "DRAFT" };
    }
  },
  async loadStock() {
    const listing = state.listing;
    if (!listing || listing.mode !== "linked" || !listing.inventoryItemId || !listing.locationId) {
      throw new Error("A linked listing is required before loading Shopify stock.");
    }
    const isCreatedProduct = listing.productId === "gid://shopify/Product/300";
    return {
      shop: listing.shop,
      variantId: listing.variantId,
      inventoryItemId: listing.inventoryItemId,
      locationId: listing.locationId,
      locationName: listing.locationName || "Montréal warehouse",
      available: isCreatedProduct && sealedInventory.valid ? sealedInventory.sealedBoxes : 7,
      onHand: isCreatedProduct && sealedInventory.valid ? sealedInventory.sealedBoxes : 8,
      committed: isCreatedProduct ? 0 : 1,
      observedAt: "2026-10-02T00:00:00.000Z"
    };
  }
};
const integrationProps: ShopifyLotIntegrationProps = {
  state,
  lot,
  connection: { status: "connected", shop: "cards.myshopify.com", offline: false, canManage: true },
  language: props.language,
  t,
  callbacks
};

function onQueryChange(value: string): void {
  state.search.query = value;
  state.search.completed = value.trim().length >= 2;
}
</script>

<template>
  <v-app>
  <AppDialogShell
    :model-value="true"
    :title="t('editLotTitle')"
    :max-width="720"
    :initial-focus-selector="'.shopify-fixture-heading'"
  >
    <template #title>
      <div class="shopify-fixture-heading" tabindex="-1">{{ t('editLotTitle') }}</div>
    </template>
    <AppFormLayout class="shopify-fixture-form">
      <template #default>
        <v-text-field :label="t('configShopifyBindingProduct')" model-value="A saved card display" variant="outlined" />
        <v-text-field :label="t('configShopifyBindingSku')" model-value="CARD-001" variant="outlined" />
        <ShopifyLotIntegration v-bind="integrationProps" @query-change="onQueryChange" />
      </template>
    </AppFormLayout>
    <template #actions>
      <v-spacer />
      <v-btn class="app-touch-target" variant="text">{{ t('commonCancel') }}</v-btn>
      <v-btn class="app-touch-target" color="primary">{{ t('commonSave') }}</v-btn>
    </template>
  </AppDialogShell>
  </v-app>
</template>

<style scoped>
.shopify-fixture-heading { font-weight: 600; }
.shopify-fixture-form { min-width: 0; }
</style>
