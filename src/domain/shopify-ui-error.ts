import { ShopifyErrorCode, shopifyErrorCodeSet, type ShopifyErrorCode as Code } from "../../shared/shopify-errors.ts";

export { ShopifyErrorCode };
export type Recovery = "retry" | "refresh" | "reconnect" | "none";
export type Translator = (key: string) => string;
const definitions: Record<Code, { key: string; recovery: Recovery }> = {
  [ShopifyErrorCode.PREVIEW_STALE]: { key: "configShopifyDraftStalePreview", recovery: "refresh" },
  [ShopifyErrorCode.PRICE_REQUIRED]: { key: "configShopifyErrorPriceRequired", recovery: "none" },
  [ShopifyErrorCode.CURRENCY_MISMATCH]: { key: "configShopifyErrorCurrencyMismatch", recovery: "none" },
  [ShopifyErrorCode.INVENTORY_INVALID]: { key: "configShopifyErrorInventoryInvalid", recovery: "none" },
  [ShopifyErrorCode.LOCATION_REQUIRED]: { key: "configShopifyErrorLocationRequired", recovery: "refresh" },
  [ShopifyErrorCode.LOT_UNAVAILABLE]: { key: "configShopifyErrorLotUnavailable", recovery: "refresh" },
  [ShopifyErrorCode.ALREADY_LINKED]: { key: "configShopifyErrorAlreadyLinked", recovery: "refresh" },
  [ShopifyErrorCode.CONNECTION_CHANGED]: { key: "configShopifyErrorConnectionChanged", recovery: "reconnect" },
  [ShopifyErrorCode.DETAILS_CHANGED]: { key: "configShopifyDetailsChanged", recovery: "refresh" },
  [ShopifyErrorCode.BINDING_CHANGED]: { key: "configShopifyConflictError", recovery: "refresh" },
  [ShopifyErrorCode.VARIANT_ALREADY_BOUND]: { key: "configShopifyConflictError", recovery: "refresh" }
};
export class ShopifyUiError extends Error {
  constructor(readonly code: Code | null, readonly recovery: Recovery, readonly messageKey: string) { super(messageKey); this.name = "ShopifyUiError"; }
}
export async function shopifyResponseUiError(response: Response | null, t: Translator, fallbackKey: string, conflictKey = "configShopifyConflictError"): Promise<ShopifyUiError> {
  let status = 0, code: string | undefined;
  if (response) {
    status = response.status;
    try { const body: unknown = await response.clone().json(); if (body && typeof body === "object" && "code" in body && typeof body.code === "string") code = body.code; } catch { /* malformed response is safely ignored */ }
  }
  if (code && shopifyErrorCodeSet.has(code)) {
    const definition = definitions[code as Code];
    return new ShopifyUiError(code as Code, definition.recovery, definition.key);
  }
  if (status === 401) return new ShopifyUiError(null, "reconnect", "configShopifyErrorUnauthorized");
  if (status === 403) return new ShopifyUiError(null, "none", "configShopifyErrorForbidden");
  if (status === 429) return new ShopifyUiError(null, "retry", "configShopifyErrorRateLimited");
  if (status >= 500 || status === 0) return new ShopifyUiError(null, "retry", "configShopifyErrorUnavailable");
  if (status === 409) return new ShopifyUiError(null, "refresh", conflictKey);
  return new ShopifyUiError(null, "none", fallbackKey);
}
export function shopifyUiErrorMessage(error: unknown, t: Translator, fallbackKey: string): string {
  if (error instanceof TypeError) { try { return t("configShopifyErrorUnavailable"); } catch { /* fall through to caller's safe fallback */ } }
  const key = error instanceof ShopifyUiError ? error.messageKey : fallbackKey;
  try { return t(key); } catch { try { return t(fallbackKey); } catch { return fallbackKey; } }
}
export function shopifyUiErrorRecovery(error: unknown): Recovery { return error instanceof ShopifyUiError ? error.recovery : "retry"; }
export function shopifySavedLotFieldsMatch(saved: { name: string; externalSku?: string }, draft: { name: string; externalSku: string }): boolean {
  return saved.name.trim() === draft.name.trim() && (saved.externalSku ?? "").trim() === draft.externalSku.trim();
}
