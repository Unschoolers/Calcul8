import { describe, expect, it } from "vitest";
import { ShopifyErrorCode, ShopifyUiError, shopifyResponseUiError, shopifyUiErrorMessage, shopifyUiErrorRecovery, shopifySavedLotFieldsMatch } from "../src/domain/shopify-ui-error.ts";
import frConfig from "../src/app-core/i18n/locales/fr/config.json";

const t = (key: string) => ({
  configShopifyConflictError: "Conflit; actualisez.", configShopifyDraftStalePreview: "Aperçu périmé; actualisez.",
  configShopifyDraftPreviewError: "Impossible de charger l’aperçu.", configShopifyErrorUnauthorized: "Reconnectez Shopify.",
  configShopifyErrorRateLimited: "Réessayez bientôt.", configShopifyErrorUnavailable: "Shopify est temporairement indisponible.", configShopifyErrorForbidden: "Permission refusée.",
  configShopifyErrorPriceRequired: "Un prix de vente est requis.", configShopifyErrorCurrencyMismatch: "La devise doit correspondre.",
  configShopifyErrorInventoryInvalid: "Le stock est invalide.", configShopifyErrorLocationRequired: "Choisissez un emplacement actif.",
  configShopifyErrorLotUnavailable: "Synchronisez ce lot.", configShopifyErrorAlreadyLinked: "Ce lot est déjà lié.",
  configShopifyErrorConnectionChanged: "La connexion Shopify a changé.", configShopifyErrorPreviewStale: "Actualisez l’aperçu.", fallback: "Erreur sûre."
}[key] ?? key);

describe("Shopify UI errors", () => {
  it("decodes stable server codes without translating messageKey", async () => {
    const response = new Response(JSON.stringify({ code: ShopifyErrorCode.PRICE_REQUIRED, error: "raw secret" }), { status: 400 });
    const error = await shopifyResponseUiError(response, t, "fallback");
    expect(error).toBeInstanceOf(ShopifyUiError);
    expect(error.code).toBe(ShopifyErrorCode.PRICE_REQUIRED);
    expect(error.messageKey).toBe("configShopifyErrorPriceRequired");
    expect(error.messageKey).not.toBe(t(error.messageKey));
    expect(shopifyUiErrorMessage(error, t, "fallback")).toBe("Un prix de vente est requis.");
  });
  it.each([
    [ShopifyErrorCode.PREVIEW_STALE, "configShopifyDraftStalePreview", "refresh"],
    [ShopifyErrorCode.PRICE_REQUIRED, "configShopifyErrorPriceRequired", "none"],
    [ShopifyErrorCode.CURRENCY_MISMATCH, "configShopifyErrorCurrencyMismatch", "none"],
    [ShopifyErrorCode.INVENTORY_INVALID, "configShopifyErrorInventoryInvalid", "none"],
    [ShopifyErrorCode.LOCATION_REQUIRED, "configShopifyErrorLocationRequired", "refresh"],
    [ShopifyErrorCode.LOT_UNAVAILABLE, "configShopifyErrorLotUnavailable", "refresh"],
    [ShopifyErrorCode.ALREADY_LINKED, "configShopifyErrorAlreadyLinked", "refresh"],
    [ShopifyErrorCode.CONNECTION_CHANGED, "configShopifyErrorConnectionChanged", "reconnect"],
    [ShopifyErrorCode.BINDING_CHANGED, "configShopifyConflictError", "refresh"],
    [ShopifyErrorCode.VARIANT_ALREADY_BOUND, "configShopifyConflictError", "refresh"]
  ] as const)("maps server code %s to its untranslated key and recovery", async (code, key, recovery) => {
    const error = await shopifyResponseUiError(new Response(JSON.stringify({ code }), { status: 400 }), t, "fallback");
    expect(error.messageKey).toBe(key);
    expect(shopifyUiErrorRecovery(error)).toBe(recovery);
  });
  it.each([[401,"configShopifyErrorUnauthorized","reconnect"],[403,"configShopifyErrorForbidden","none"],[429,"configShopifyErrorRateLimited","retry"],[503,"configShopifyErrorUnavailable","retry"]] as const)("maps HTTP %i to localized safe recovery", async (status,key,recovery) => {
    const error = await shopifyResponseUiError(new Response("not json", {status}), t, "fallback");
    expect(error.messageKey).toBe(key); expect(shopifyUiErrorRecovery(error)).toBe(recovery);
  });
  it("uses safe text on unknown codes, malformed bodies, null, and network failures", async () => {
    for (const response of [new Response("nope",{status:500}), new Response(JSON.stringify({code:"NOPE",error:"token=secret"}),{status:400}), null]) {
      const error = await shopifyResponseUiError(response, t, "fallback");
      expect(shopifyUiErrorMessage(error,t,"fallback")).not.toMatch(/secret|token=/);
    }
    const error = new Error("provider token=secret");
    expect(shopifyUiErrorMessage(error,t,"fallback")).toBe("Erreur sûre.");
    expect(shopifyUiErrorRecovery(error)).toBe("retry");
    expect(shopifyUiErrorMessage(new TypeError("raw provider token=secret"),t,"fallback")).toBe("Shopify est temporairement indisponible.");
  });
  it("separates authentication from permission recovery and honors a known code before status", async () => {
    const auth = await shopifyResponseUiError(new Response("{}",{status:401}), t,"fallback");
    const forbidden = await shopifyResponseUiError(new Response("{}",{status:403}), t,"fallback");
    const coded = await shopifyResponseUiError(new Response(JSON.stringify({code: ShopifyErrorCode.PREVIEW_STALE}),{status:401}), t,"fallback");
    expect(shopifyUiErrorRecovery(auth)).toBe("reconnect");
    expect(shopifyUiErrorRecovery(forbidden)).toBe("none");
    expect(shopifyUiErrorRecovery(coded)).toBe("refresh");
  });
  it("uses a real French catalog value for a server validation code", async () => {
    const error = await shopifyResponseUiError(new Response(JSON.stringify({code: ShopifyErrorCode.PRICE_REQUIRED}),{status:400}), key => String((frConfig as Record<string, unknown>)[key] ?? key), "fallback");
    expect(shopifyUiErrorMessage(error, key => String((frConfig as Record<string, unknown>)[key] ?? key), "fallback")).toBe("Ajoutez un prix de vente positif à ce lot.");
  });
  it("preserves local typed recovery and normalizes saved fields", () => {
    const error = new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE,"refresh","configShopifyErrorPreviewStale");
    expect(shopifyUiErrorRecovery(error)).toBe("refresh");
    expect(shopifySavedLotFieldsMatch({name:"  Box ",externalSku:" ABC "},{name:"Box",externalSku:"ABC"})).toBe(true);
    expect(shopifySavedLotFieldsMatch({name:"Box"},{name:"Box",externalSku:""})).toBe(true);
  });
});

it("Shopify creation requires saving image-only edits and removals first", () => {
  const image = "data:image/jpeg;base64,/9j/2Q==";
  expect(shopifySavedLotFieldsMatch({ name: "Box", image }, { name: "Box", externalSku: "", image })).toBe(true);
  expect(shopifySavedLotFieldsMatch({ name: "Box" }, { name: "Box", externalSku: "", image })).toBe(false);
  expect(shopifySavedLotFieldsMatch({ name: "Box", image }, { name: "Box", externalSku: "", image: "" })).toBe(false);
});
