import { normalizeWhatnotVertical } from "../../domain/whatnot-fees.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../context/commerce.ts";
import { isSinglesLot } from "../shared/lot-types.ts";
import { validateRenameLotName } from "./config-lot-crud.ts";
import { queueCloudConfigSyncPush, queueWorkspaceConfigSyncPush } from "./ui/workspace/workspace-config-sync.ts";
import { closeShopifyEditState, shopifyEditorMethods } from "./ui/shopify/shopify-editor.ts";

export const configLotEditMethods = {
  ...shopifyEditorMethods,

  openRenameLotModal(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }
    const lot = this.lots.find(candidate => candidate.id === this.currentLotId);
    if (!lot) return;
    shopifyEditorMethods.resetShopifyEditor.call(this);
    this.renameLotName = lot.name;
    this.renameLotWhatnotVertical = normalizeWhatnotVertical(lot.whatnotVertical);
    this.renameLotExternalSku = typeof lot.externalSku === "string" ? lot.externalSku : "";
    // Publish eligibility is inventory configuration. The manager owns Shopify binding actions.
    this.renameLotShopifyEnabled = lot.shopifyEnabled === true;
    this.shopifyEditBindingVersion = null;
    this.shopifyEditGeneration = null;
    this.shopifyEditSessionAuthEpoch = this.googleAuthEpoch;
    this.shopifyEditSessionScope = JSON.stringify(shopifyEditScopeBody(this));
    this.shopifyEditSessionLotId = lot.id;
    this.showRenameLotModal = true;
    if (this.shopifyConnectionStatus === "connected" && !isSinglesLot(lot)) void this.refreshShopifyEditListing();
  },

  closeRenameLotModal(): void {
    closeLotEditDialog(this);
  },

  async renameCurrentLot(): Promise<void> {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }
    const lot = this.lots.find(candidate => candidate.id === this.currentLotId);
    if (!lot) return;
    if (this.shopifyEditSessionLotId != null && (!this.showRenameLotModal || !shopifyEditSessionIsCurrent(this))) {
      this.shopifyEditError = this.t("configShopifyStaleLotError");
      this.shopifyEditRecovery = "refresh";
      this.shopifyEditErrorOperation = "binding";
      return;
    }
    const renameResult = validateRenameLotName(this.lots, lot, this.renameLotName);
    if (!renameResult.ok) {
      this.notify(renameResult.message, "warning");
      return;
    }
    const nextVertical = normalizeWhatnotVertical(this.renameLotWhatnotVertical);
    const nextSku = (this.renameLotExternalSku ?? "").trim();
    const categoryChanged = normalizeWhatnotVertical(lot.whatnotVertical) !== nextVertical;
    const skuChanged = (lot.externalSku ?? "") !== nextSku;
    const publishChanged = this.shopifyEditListing?.mode === "managed" &&
      (lot.shopifyEnabled === true) !== (this.renameLotShopifyEnabled === true);
    if (!renameResult.changed && !categoryChanged && !skuChanged && !publishChanged) {
      closeLotEditDialog(this);
      return;
    }
    if (renameResult.changed) lot.name = renameResult.nextName;
    lot.whatnotVertical = nextVertical;
    lot.externalSku = nextSku;
    if (publishChanged) lot.shopifyEnabled = this.renameLotShopifyEnabled === true;
    this.externalSku = nextSku;
    this.whatnotVertical = nextVertical;
    this.saveLotsToStorage();
    queueWorkspaceConfigSyncPush(this);
    if (categoryChanged || skuChanged || publishChanged) queueCloudConfigSyncPush(this);
    closeLotEditDialog(this);
    this.renameLotName = "";
    this.renameLotWhatnotVertical = nextVertical;
    if (this.currentTab === "portfolio") void this.$nextTick(() => this.initPortfolioChart());
    if (renameResult.changed) this.notify("Lot renamed", "success");
  }
} satisfies Pick<ConfigLotMethodImplementation,
  | "openRenameLotModal" | "closeRenameLotModal" | "renameCurrentLot"
  | "loadShopifyDraftPreview" | "createShopifyDraft" | "refreshShopifyEditListing" | "loadShopifyLinkedStock"
  | "onShopifyEditQueryChange" | "restoreShopifyEditSelection" | "selectShopifyEditVariant"
  | "selectShopifyEditLocation" | "searchShopifyEditProducts" | "saveShopifyBinding"
  | "applyShopifyBinding" | "saveShopifyProductDetails" | "resetShopifyEditor"
> & ThisType<LotConfigurationContext>;

function closeLotEditDialog(context: LotConfigurationContext): void {
  if (context.shopifyEditSaving) return;
  shopifyEditorMethods.resetShopifyEditor.call(context);
  closeShopifyEditState(context);
  context.shopifyEditSessionAuthEpoch = null;
  context.shopifyEditSessionScope = "";
  context.shopifyEditSessionLotId = null;
}

function shopifyEditScopeBody(context: Pick<LotConfigurationContext, "activeScopeType" | "activeWorkspaceId">): { workspaceId?: string } {
  return context.activeScopeType === "workspace" && context.activeWorkspaceId ? { workspaceId: context.activeWorkspaceId } : {};
}
function shopifyEditSessionIsCurrent(context: Pick<LotConfigurationContext,
  "shopifyEditSessionAuthEpoch" | "googleAuthEpoch" | "shopifyEditSessionScope" | "activeScopeType" | "activeWorkspaceId" | "shopifyEditSessionLotId" | "currentLotId"
>): boolean {
  return context.shopifyEditSessionAuthEpoch === context.googleAuthEpoch &&
    context.shopifyEditSessionScope === JSON.stringify(shopifyEditScopeBody(context)) &&
    context.shopifyEditSessionLotId === context.currentLotId;
}
