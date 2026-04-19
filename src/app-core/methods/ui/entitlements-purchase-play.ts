import {
  extractPurchaseTokenFromResult,
  getPlayBillingService,
  isPlayBillingPaymentRequestSupported,
  purchasePlayProduct,
  type DigitalGoodsService
} from "../../utils/playBilling.ts";
import { getStoredGoogleIdToken } from "../../auth/index.ts";
import {
  resolveApiBaseUrl,
  submitPlayPurchaseVerification
} from "./shared.ts";
import {
  formatPlayPurchaseError,
  isAlreadyOwnedPurchaseError
} from "./entitlements-shared.ts";
import type { PlayPurchaseApp } from "./entitlements-purchase-types.ts";

const PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS = 10;
const PLAY_PURCHASE_RECOVERY_BASE_DELAY_MS = 250;
const PLAY_PURCHASE_RECOVERY_MAX_DELAY_MS = 1200;
const PLAY_PURCHASE_PRECHECK_ATTEMPTS = 4;

const VERIFIED_PURCHASE_MESSAGE = "Purchase verified. Pro features unlocked.";
const VERIFIED_EXISTING_PURCHASE_MESSAGE = "Existing purchase found and verified. Pro features unlocked.";

export type PlayPurchaseDeps = {
  resolveApiBaseUrl: typeof resolveApiBaseUrl;
  getGoogleIdToken: () => string;
  getConfiguredPlayProductId: () => string;
  getPlayBillingService: typeof getPlayBillingService;
  isPlayBillingPaymentRequestSupported: typeof isPlayBillingPaymentRequestSupported;
  purchasePlayProduct: typeof purchasePlayProduct;
  extractPurchaseTokenFromResult: typeof extractPurchaseTokenFromResult;
  submitPlayPurchaseVerification: typeof submitPlayPurchaseVerification;
  isAlreadyOwnedPurchaseError: typeof isAlreadyOwnedPurchaseError;
  formatPlayPurchaseError: typeof formatPlayPurchaseError;
  sleep: (ms: number) => Promise<void>;
};

export const defaultPlayPurchaseDeps: PlayPurchaseDeps = {
  resolveApiBaseUrl,
  getGoogleIdToken: () => getStoredGoogleIdToken(),
  getConfiguredPlayProductId: () => (import.meta.env.VITE_PLAY_PRO_PRODUCT_ID as string | undefined)?.trim() || "",
  getPlayBillingService,
  isPlayBillingPaymentRequestSupported,
  purchasePlayProduct,
  extractPurchaseTokenFromResult,
  submitPlayPurchaseVerification,
  isAlreadyOwnedPurchaseError,
  formatPlayPurchaseError,
  sleep: (ms) => new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  })
};

function resetPlayPurchaseInputs(app: PlayPurchaseApp): void {
  app.purchaseTokenInput = "";
  app.purchaseProductIdInput = "";
  app.purchasePackageNameInput = "";
  app.showVerifyPurchaseModal = false;
}

async function verifyPlayPurchaseToken(
  app: PlayPurchaseApp,
  deps: PlayPurchaseDeps,
  params: {
    baseUrl: string;
    googleIdToken: string;
    purchaseToken: string;
    productId: string;
    successMessage: string;
  }
): Promise<boolean> {
  const verified = await deps.submitPlayPurchaseVerification(app, {
    baseUrl: params.baseUrl,
    googleIdToken: params.googleIdToken,
    purchaseToken: params.purchaseToken,
    productId: params.productId
  });
  if (!verified) {
    return false;
  }

  resetPlayPurchaseInputs(app);
  app.notify(params.successMessage, "success");
  return true;
}

async function tryRecoverExistingPurchase(
  app: PlayPurchaseApp,
  deps: PlayPurchaseDeps,
  params: {
    playBilling: DigitalGoodsService | null;
    baseUrl: string;
    googleIdToken: string;
    productId: string;
    attempts: number;
    successMessage: string;
  }
): Promise<boolean> {
  if (!params.playBilling || typeof params.playBilling.listPurchases !== "function") {
    return false;
  }

  for (let attempt = 0; attempt < params.attempts; attempt += 1) {
    try {
      const listedPurchases = await params.playBilling.listPurchases();
      const existing = deps.extractPurchaseTokenFromResult(listedPurchases, params.productId);
      if (existing.purchaseToken) {
        return verifyPlayPurchaseToken(app, deps, {
          baseUrl: params.baseUrl,
          googleIdToken: params.googleIdToken,
          purchaseToken: existing.purchaseToken,
          productId: params.productId,
          successMessage: params.successMessage
        });
      }
    } catch (error) {
      if (attempt === params.attempts - 1) {
        console.warn("[whatfees] Play purchase recovery failed", error);
      }
    }

    if (attempt < params.attempts - 1) {
      const delayMs = attempt === 0
        ? 0
        : Math.min(
          PLAY_PURCHASE_RECOVERY_MAX_DELAY_MS,
          PLAY_PURCHASE_RECOVERY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        );
      if (delayMs > 0) {
        await deps.sleep(delayMs);
      }
    }
  }

  return false;
}

export async function startPlayPurchaseFlow(
  app: PlayPurchaseApp,
  deps: Partial<PlayPurchaseDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultPlayPurchaseDeps, ...deps } satisfies PlayPurchaseDeps;
  if (app.isVerifyingPurchase) {
    return;
  }

  if (app.hasProAccess) {
    app.notify("Pro is already unlocked on this account.", "info");
    return;
  }

  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) {
    app.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
    return;
  }

  const googleIdToken = resolvedDeps.getGoogleIdToken();
  const productId = resolvedDeps.getConfiguredPlayProductId() || app.purchaseProductIdInput.trim();
  if (!productId) {
    app.notify("Missing Play product configuration (VITE_PLAY_PRO_PRODUCT_ID).", "error");
    return;
  }

  app.isVerifyingPurchase = true;
  let playBilling: DigitalGoodsService | null = null;

  try {
    playBilling = await resolvedDeps.getPlayBillingService();
    if (!playBilling && !resolvedDeps.isPlayBillingPaymentRequestSupported()) {
      app.notify("Google Play billing is not available in this environment.", "warning");
      return;
    }

    if (playBilling && typeof playBilling.listPurchases === "function") {
      const preCheckRecovered = await tryRecoverExistingPurchase(app, resolvedDeps, {
        playBilling,
        baseUrl: base,
        googleIdToken,
        productId,
        attempts: PLAY_PURCHASE_PRECHECK_ATTEMPTS,
        successMessage: VERIFIED_EXISTING_PURCHASE_MESSAGE
      });
      if (preCheckRecovered) {
        return;
      }
    }

    const purchase = await resolvedDeps.purchasePlayProduct(playBilling, productId);
    if (!purchase.purchaseToken) {
      const postPurchaseRecovered = await tryRecoverExistingPurchase(app, resolvedDeps, {
        playBilling,
        baseUrl: base,
        googleIdToken,
        productId,
        attempts: PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS,
        successMessage: VERIFIED_PURCHASE_MESSAGE
      });
      if (postPurchaseRecovered) {
        return;
      }
      app.notify("Could not read purchase token from Google Play.", "error");
      return;
    }

    const verified = await resolvedDeps.submitPlayPurchaseVerification(app, {
      baseUrl: base,
      googleIdToken,
      purchaseToken: purchase.purchaseToken,
      productId
    });
    if (!verified) return;

    resetPlayPurchaseInputs(app);
    app.notify(VERIFIED_PURCHASE_MESSAGE, "success");
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const isAbortError = name === "AbortError";
    const isAlreadyOwnedError = resolvedDeps.isAlreadyOwnedPurchaseError(error);
    const canTryRecovery = !!playBilling
      && typeof playBilling.listPurchases === "function"
      && (!isAbortError || isAlreadyOwnedError);

    if (canTryRecovery) {
      const recovered = await tryRecoverExistingPurchase(app, resolvedDeps, {
        playBilling,
        baseUrl: base,
        googleIdToken,
        productId,
        attempts: PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS,
        successMessage: VERIFIED_EXISTING_PURCHASE_MESSAGE
      });
      if (recovered) {
        return;
      }
    }

    if (isAbortError && !isAlreadyOwnedError) {
      app.notify("Purchase cancelled.", "info");
      return;
    }

    if (isAlreadyOwnedError) {
      app.notify("Google Play still syncing this purchase. Please wait a few seconds and try again.", "info");
      return;
    }

    console.warn("[whatfees] Play purchase error", error);
    const detail = resolvedDeps.formatPlayPurchaseError(error);
    app.notify(`Could not complete Google Play purchase. ${detail}`, "error");
  } finally {
    app.isVerifyingPurchase = false;
  }
}

export async function verifyPlayPurchaseFlow(
  app: PlayPurchaseApp,
  deps: Partial<PlayPurchaseDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultPlayPurchaseDeps, ...deps } satisfies PlayPurchaseDeps;
  if (app.isVerifyingPurchase) {
    return;
  }

  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) {
    app.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
    return;
  }

  const purchaseToken = app.purchaseTokenInput.trim();
  if (!purchaseToken) {
    app.notify("Enter a purchase token to continue.", "warning");
    return;
  }

  const googleIdToken = resolvedDeps.getGoogleIdToken();
  app.isVerifyingPurchase = true;

  try {
    const verified = await resolvedDeps.submitPlayPurchaseVerification(app, {
      baseUrl: base,
      googleIdToken,
      purchaseToken,
      productId: app.purchaseProductIdInput.trim(),
      packageName: app.purchasePackageNameInput.trim()
    });
    if (!verified) return;
    app.purchaseTokenInput = "";
    app.showVerifyPurchaseModal = false;
    app.notify(VERIFIED_PURCHASE_MESSAGE, "success");
  } catch (error) {
    console.warn("[whatfees] Purchase verification error", error);
    app.notify("Could not verify purchase. Please try again.", "error");
  } finally {
    app.isVerifyingPurchase = false;
  }
}
