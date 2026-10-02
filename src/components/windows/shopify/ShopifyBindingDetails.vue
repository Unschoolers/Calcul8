<script setup lang="ts">
import { computed } from "vue";
import type { ShopifyEditListing } from "../../../types/app.ts";
import { isShopifyProductStatus } from "../../../../shared/shopify-product-status.ts";
import { shopifyAdminProductUrl } from "../../../domain/shopify-admin-url.ts";

const props = defineProps<{ listing: ShopifyEditListing; t: (key: string) => string }>();
const productUrl = computed(() => shopifyAdminProductUrl(props.listing.shop, props.listing.productId));
const statusKey = computed(() => {
  if (!isShopifyProductStatus(props.listing.productStatus)) return "configShopifyProductStatusUnavailable";
  return `configShopifyProductStatus${props.listing.productStatus[0]}${props.listing.productStatus.slice(1).toLowerCase()}`;
});
</script>

<template>
  <v-card class="shopify-binding-card mb-3" variant="outlined" role="group" :aria-label="t('configShopifyBindingDetails')" data-testid="shopify-binding-details">
    <v-card-text class="pa-3 pa-sm-4">
      <div class="shopify-binding-card__header d-flex align-start justify-space-between flex-wrap ga-2 mb-2">
        <div class="shopify-binding-card__title text-subtitle-2 font-weight-medium">{{ listing.productTitle || listing.productId }}</div>
        <v-chip class="shopify-binding-card__status" size="small" variant="tonal" :color="isShopifyProductStatus(listing.productStatus) ? 'primary' : 'secondary'" data-testid="shopify-product-status">
          {{ t(statusKey) }}
        </v-chip>
      </div>
      <dl class="shopify-binding-card__metadata">
        <div><dt>{{ t('configShopifyBindingVariant') }}</dt><dd>{{ listing.variantTitle || listing.variantId }}</dd></div>
        <div><dt>{{ t('configShopifyBindingSku') }}</dt><dd>{{ listing.sku || t('configShopifyNoSku') }}</dd></div>
        <div><dt>{{ t('configShopifyBindingShop') }}</dt><dd>{{ listing.shop || t('configShopifyUnknown') }}</dd></div>
        <div><dt>{{ t('configShopifyBindingLocation') }}</dt><dd>{{ listing.locationName || listing.locationId || t('configShopifyUnknownLocation') }}</dd></div>
      </dl>
      <a v-if="productUrl" class="shopify-binding-card__link" :href="productUrl" target="_blank" rel="noopener noreferrer">{{ t('configShopifyOpenProduct') }}</a>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.shopify-binding-card { min-width: 0; }
.shopify-binding-card__header { min-width: 0; }
.shopify-binding-card__title { min-width: 0; max-width: 100%; flex: 1 1 12rem; overflow-wrap: anywhere; }
.shopify-binding-card__status { min-width: 0; max-width: 100%; flex: 0 1 auto; }
.shopify-binding-card__metadata { display: grid; grid-template-columns: minmax(0, 1fr); gap: .55rem .9rem; margin: 0; }
.shopify-binding-card__metadata > div { min-width: 0; }
.shopify-binding-card__metadata dt { color: rgb(var(--v-theme-on-surface-variant)); font-size: .75rem; line-height: 1.3; }
.shopify-binding-card__metadata dd { margin: .1rem 0 0; overflow-wrap: anywhere; font-size: .875rem; }
.shopify-binding-card__link { display: inline-flex; align-items: center; min-height: 44px; margin-top: .35rem; overflow-wrap: anywhere; }
@media (min-width: 600px) { .shopify-binding-card__metadata { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
