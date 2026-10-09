import type { ShopifyEditListing, ShopifyVariantSearchResult } from "../../../../types/app.ts";
import type { ShopifyDraftPreview } from "../../../../domain/shopify-draft.ts";
import { shopifyUiErrorMessage, shopifySavedLotFieldsMatch } from "../../../../domain/shopify-ui-error.ts";
import { type BindingMutation, type BindingResult, type DraftCreateMutation, type ProductDetailsMutation } from "../../../../../shared/shopify-product-manager.ts";
import { AsyncSearchLifecycle } from "../../../shared/async-search-lifecycle.ts";

export const shopifyEditSearchTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
export const shopifyEditSearchLifecycles = new WeakMap<object, AsyncSearchLifecycle<unknown>>();
export function shopifyEditSearchLifecycle(context: object): AsyncSearchLifecycle<unknown> {
  let lifecycle = shopifyEditSearchLifecycles.get(context);
  if (!lifecycle) { lifecycle = new AsyncSearchLifecycle(); shopifyEditSearchLifecycles.set(context, lifecycle); }
  return lifecycle;
}
export const shopifyDraftPreviewCache = new WeakMap<object, ShopifyDraftPreview>();

export function shopifyVariantLabel(result: ShopifyVariantSearchResult, noSku: string): string {
  return `${result.title}${result.variantTitle && result.variantTitle !== "Default Title" ? ` · ${result.variantTitle}` : ""} · ${result.sku || noSku} · ${result.price}`;
}
export function cancelShopifyEditSearchTimer(context: object): void {
  shopifyEditSearchLifecycle(context).clear();
  const timer = shopifyEditSearchTimers.get(context);
  if (timer) clearTimeout(timer);
  shopifyEditSearchTimers.delete(context);
}

export type ShopifyEditApiScope = { activeScopeType: string; activeWorkspaceId: string | null };
export function shopifyEditScopeBody(context: ShopifyEditApiScope): { workspaceId?: string } {
  return context.activeScopeType === "workspace" && context.activeWorkspaceId ? { workspaceId: context.activeWorkspaceId } : {};
}
export type ShopifyEditRequestContext = { googleAuthEpoch: number; activeScopeType: string; activeWorkspaceId: string | null; currentLotId: number | null; showRenameLotModal: boolean; shopifyEditRequestRevision: number; shopifyEditSessionAuthEpoch: number | null; shopifyEditSessionScope: string; shopifyEditSessionLotId: number | null; shopifyConnectionStatus: string; shopifyConnectionShop: string | null };
export function shopifyEditRequestIsOwned(context: ShopifyEditRequestContext, captured: { auth: number; scope: string; lotId: number | null; revision: number }): boolean {
  return context.showRenameLotModal && context.googleAuthEpoch === captured.auth &&
    JSON.stringify(shopifyEditScopeBody(context)) === captured.scope && context.currentLotId === captured.lotId &&
    context.shopifyEditRequestRevision === captured.revision && context.shopifyEditSessionAuthEpoch === captured.auth &&
    context.shopifyEditSessionScope === captured.scope && context.shopifyEditSessionLotId === captured.lotId;
}
export function shopifyEditRequestIsCurrent(context: ShopifyEditRequestContext, captured: { auth: number; scope: string; lotId: number | null; revision: number; shop: string | null }): boolean {
  return shopifyEditRequestIsOwned(context, captured) && context.shopifyConnectionStatus === "connected" && context.shopifyConnectionShop === captured.shop;
}
export function shopifyEditSessionIsCurrent(context: ShopifyEditRequestContext): boolean {
  return context.shopifyEditSessionAuthEpoch === context.googleAuthEpoch &&
    context.shopifyEditSessionScope === JSON.stringify(shopifyEditScopeBody(context)) &&
    context.shopifyEditSessionLotId === context.currentLotId;
}
export function closeShopifyEditState(context: { shopifyEditRequestRevision: number; shopifyEditLoading: boolean; shopifyEditSaving: boolean; shopifyEditSearchResults: ShopifyVariantSearchResult[]; shopifyEditSearchCompleted: boolean; shopifyEditSelectedVariantId: string | null; shopifyEditSelectedLocationId: string | null; shopifyEditError: string | null; shopifyEditRecovery: "retry" | "refresh" | "reconnect" | "none"; shopifyEditErrorOperation: "listing" | "search" | "link" | "binding" | "details" | "create" | null; shopifyEditListingStatus: "idle" | "loading" | "loaded" | "error"; shopifyEditManagerOpen: boolean; showRenameLotModal: boolean }): void {
  context.shopifyEditRequestRevision += 1;
  context.shopifyEditLoading = false;
  context.shopifyEditSaving = false;
  context.shopifyEditSearchResults = [];
  context.shopifyEditSearchCompleted = false;
  context.shopifyEditSelectedVariantId = null;
  context.shopifyEditSelectedLocationId = null;
  context.shopifyEditError = null;
  context.shopifyEditRecovery = "none";
  context.shopifyEditErrorOperation = null;
  context.shopifyEditListingStatus = "idle";
  context.shopifyEditManagerOpen = false;
  context.showRenameLotModal = false;
}
export function shopifyEditErrorText(error: unknown, t: (key: string) => string, fallback: string): string { return shopifyUiErrorMessage(error, t, fallback); }

export function shopifyEditOwnerScope(context: ShopifyEditRequestContext): string {
  return JSON.stringify({ auth: context.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(context)), lotId: context.currentLotId, shop: context.shopifyConnectionShop });
}
export function newShopifyOperationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `shopify-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isBindingResult(value: unknown): value is BindingResult {
  if (!isRecord(value) || !("listing" in value) || (value.bindingVersion !== null && typeof value.bindingVersion !== "string")) return false;
  if (value.shop != null && typeof value.shop !== "string") return false;
  if (value.generation != null && (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0)) return false;
  if (value.listing === null) return true;
  if (!isRecord(value.listing)) return false;
  return (value.listing.mode === "linked" || value.listing.mode === "managed") &&
    typeof value.listing.productId === "string" && typeof value.listing.variantId === "string" &&
    typeof value.listing.inventoryItemId === "string" && typeof value.listing.locationId === "string";
}
export function scopedResult(payload: unknown, context: { shopifyEditBindingVersion: string | null; shopifyEditGeneration: number | null }, allowLegacy = false): BindingResult {
  if (isBindingResult(payload) && typeof payload.bindingVersion === "string" && payload.bindingVersion.length > 0 &&
    typeof payload.shop === "string" && Number.isSafeInteger(payload.generation)) return payload;
  if (allowLegacy && isRecord(payload) && "listing" in payload) {
    return {
      listing: (payload.listing ?? null) as BindingResult["listing"],
      bindingVersion: typeof payload.bindingVersion === "string" ? payload.bindingVersion : context.shopifyEditBindingVersion,
      ...(typeof payload.shop === "string" || payload.shop === null ? { shop: payload.shop } : {}),
      ...(Number.isSafeInteger(payload.generation) ? { generation: Number(payload.generation) } : context.shopifyEditGeneration !== null ? { generation: context.shopifyEditGeneration } : {})
    };
  }
  throw new Error("configShopifyInvalidResponse");
}
export async function refreshSummaryAfterSuccess(context: { refreshShopifyBindings(): Promise<void> }): Promise<void> {
  try { await context.refreshShopifyBindings(); } catch { /* Summary refresh is independent from the confirmed provider mutation. */ }
}
export function clearPendingShopifyAttempts(context: { shopifyEditPendingOwnerScope: string | null; shopifyEditPendingBindingMutation: BindingMutation | null; shopifyEditPendingDetailsMutation: ProductDetailsMutation | null; shopifyEditPendingCreateMutation: DraftCreateMutation | null; shopifyEditOperationId: string | null }, ownerScope: string): void {
  if (context.shopifyEditPendingOwnerScope && context.shopifyEditPendingOwnerScope !== ownerScope) {
    context.shopifyEditPendingBindingMutation = null;
    context.shopifyEditPendingDetailsMutation = null;
    context.shopifyEditPendingCreateMutation = null;
    context.shopifyEditOperationId = null;
    context.shopifyEditPendingOwnerScope = null;
  }
}

export type ShopifyDraftEligibilityContext = ShopifyEditRequestContext & {
  activeScopeType: string;
  activeWorkspaceId: string | null;
  isCurrentWorkspaceOwner: boolean;
  isOffline: boolean;
  currentLotType: string;
  lots: Array<{ id: number; name: string; externalSku?: string; image?: string }>;
  renameLotName: string;
  renameLotExternalSku: string;
  renameLotImage: string;
  renameLotImageBusy: boolean;
  shopifyEditListing: ShopifyEditListing | null;
  shopifyEditListingStatus: "idle" | "loading" | "loaded" | "error";
  shopifyEditSaving: boolean;
};

export function canCreateShopifyDraft(context: ShopifyDraftEligibilityContext): boolean {
  const lot = context.lots.find(candidate => candidate.id === context.currentLotId);
  return Boolean(lot && context.currentLotType === "bulk" && context.shopifyConnectionStatus === "connected" &&
    !context.isOffline && !context.renameLotImageBusy && !context.shopifyEditSaving && context.showRenameLotModal &&
    context.shopifyEditListingStatus === "loaded" && !context.shopifyEditListing && shopifyEditSessionIsCurrent(context) &&
    (context.activeScopeType !== "workspace" || (context.activeWorkspaceId && context.isCurrentWorkspaceOwner)) &&
    shopifySavedLotFieldsMatch({ name: lot.name, externalSku: lot.externalSku, image: lot.image }, { name: context.renameLotName, externalSku: context.renameLotExternalSku, image: context.renameLotImage }));
}
