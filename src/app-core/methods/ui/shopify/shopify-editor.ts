import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { createShopifyController } from "./shopify-editor-create-controller.ts";
import { bindingShopifyController } from "./shopify-editor-binding-controller.ts";
import { detailsShopifyController } from "./shopify-editor-details-controller.ts";
import { sessionShopifyController } from "./shopify-editor-session-controller.ts";
import { searchShopifyController } from "./shopify-editor-search-controller.ts";

export { closeShopifyEditState } from "./shopify-editor-support.ts";

/** Compatibility surface consumed by configuration callers. Controller behavior lives by responsibility. */
export const shopifyEditorMethods = {
  ...createShopifyController,
  ...bindingShopifyController,
  ...detailsShopifyController,
  ...sessionShopifyController,
  ...searchShopifyController
} satisfies Pick<ConfigLotMethodImplementation,
  | "loadShopifyDraftPreview" | "createShopifyDraft" | "refreshShopifyEditListing" | "loadShopifyLinkedStock"
  | "onShopifyEditQueryChange" | "restoreShopifyEditSelection" | "selectShopifyEditVariant"
  | "selectShopifyEditLocation" | "searchShopifyEditProducts" | "saveShopifyBinding"
  | "applyShopifyBinding" | "saveShopifyProductDetails" | "resetShopifyEditor"
> & ThisType<LotConfigurationContext>;
