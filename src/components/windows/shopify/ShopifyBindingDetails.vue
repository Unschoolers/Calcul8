<script setup lang="ts">
import { computed } from "vue";
import type { ShopifyEditListing } from "../../../types/app.ts";
import { shopifyAdminProductUrl } from "../../../domain/shopify-admin-url.ts";

const props = defineProps<{ listing: ShopifyEditListing; t: (key: string) => string }>();
const productUrl = computed(() => shopifyAdminProductUrl(props.listing.shop, props.listing.productId));
</script>

<template>
  <div class="text-caption text-medium-emphasis mb-3" style="overflow-wrap: anywhere" data-testid="shopify-binding-details">
    <div><strong>{{ t('configShopifyBindingProduct') }}:</strong> {{ listing.productTitle || listing.productId }}</div>
    <div><strong>{{ t('configShopifyBindingVariant') }}:</strong> {{ listing.variantTitle || listing.variantId }}</div>
    <div><strong>{{ t('configShopifyBindingSku') }}:</strong> {{ listing.sku || t('configShopifyNoSku') }}</div>
    <div><strong>{{ t('configShopifyBindingLocation') }}:</strong> {{ listing.locationName || listing.locationId || t('configShopifyUnknownLocation') }}</div>
    <a v-if="productUrl" :href="productUrl" target="_blank" rel="noopener noreferrer">{{ t('configShopifyOpenProduct') }}</a>
  </div>
</template>
