import type { AppContext } from "../../context.ts";
import {
  extractPurchaseTokenFromResult,
  getPlayBillingService,
  isPlayBillingPaymentRequestSupported,
  purchasePlayProduct,
  type DigitalGoodsService
} from "../../utils/playBilling.ts";
import {
  getSupportedPurchaseProviders,
  GOOGLE_TOKEN_KEY,
  resolvePurchaseProvider,
  resolveApiBaseUrl,
  submitPlayPurchaseVerification
} from "./shared.ts";
import {
  formatPlayPurchaseError,
  hasPlayPurchaseSupport,
  isAlreadyOwnedPurchaseError
} from "./entitlements-shared.ts";
import {
  closeStripeEmbeddedCheckout,
  runStripePurchaseFlow,
  runStripeVerificationFlow,
  type StripeCheckoutApp,
  type StripePurchaseApp,
  type StripeVerificationApp
} from "./entitlements-stripe.ts";

const PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS = 10;
const PLAY_PURCHASE_RECOVERY_BASE_DELAY_MS = 250;
const PLAY_PURCHASE_RECOVERY_MAX_DELAY_MS = 1200;
const PLAY_PURCHASE_PRECHECK_ATTEMPTS = 4;

export type PurchaseRoutingApp = Pick<AppContext, "notify"> & PlayPurchaseApp & StripePurchaseApp & StripeVerificationApp;
export type PlayPurchaseApp = Pick<
  AppContext,
  | "isVerifyingPurchase"
  | "hasProAccess"
  | "googleAuthEpoch"
  | "purchaseTokenInput"
  | "purchaseProductIdInput"
  | "purchasePackageNameInput"
  | "showVerifyPurchaseModal"
  | "notify"
  | "debugLogEntitlement"
>;

type PurchaseProvider = "auto" | "play" | "stripe" | string;

type PurchaseServiceDeps = {
  resolvePurchaseProvider: () => PurchaseProvider;
  hasPlayPurchaseSupport: typeof hasPlayPurchaseSupport;
  getSupportedPurchaseProviders: typeof getSupportedPurchaseProviders;
  startPlayPurchase: (app: PlayPurchaseApp) => Promise<void>;
  verifyPlayPurchase: (app: PlayPurchaseApp) => Promise<void>;
  runStripePurchaseFlow: (app: StripePurchaseApp) => Promise<void>;
  runStripeVerificationFlow: (app: StripeVerificationApp) => Promise<void>;
  closeStripeEmbeddedCheckout: (app: StripeCheckoutApp, options?: { notifyCanceled?: boolean }) => Promise<void>;
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

const defaultDeps: PurchaseServiceDeps = {
  resolvePurchaseProvider,
  hasPlayPurchaseSupport,
  getSupportedPurchaseProviders,
  startPlayPurchase: (app) => startPlayPurchaseFlow(app),
  verifyPlayPurchase: (app) => verifyPlayPurchaseFlow(app),
  runStripePurchaseFlow,
  runStripeVerificationFlow,
  closeStripeEmbeddedCheckout,
  resolveApiBaseUrl,
  getGoogleIdToken: () => (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim(),
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

async function resolveEffectiveProvider(deps: PurchaseServiceDeps): Promise<PurchaseProvider> {
  const configuredProvider = deps.resolvePurchaseProvider();
  if (configuredProvider !== "auto") {
    return configuredProvider;
  }
  return (await deps.hasPlayPurchaseSupport()) ? "play" : "stripe";
}

export async function startProPurchaseFlow(
  app: PurchaseRoutingApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  const provider = await resolveEffectiveProvider(resolvedDeps);

  if (provider === "play") {
    await resolvedDeps.startPlayPurchase(app);
    return;
  }

  if (provider === "stripe") {
    await resolvedDeps.runStripePurchaseFlow(app);
    return;
  }

  const supported = resolvedDeps.getSupportedPurchaseProviders();
  const supportedText = supported.join(", ");
  app.notify(
    `${provider} purchases are not enabled yet. Supported provider${supported.length === 1 ? "" : "s"}: ${supportedText}.`,
    "info"
  );
}

export async function verifyProPurchaseFlow(
  app: PurchaseRoutingApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  const provider = await resolveEffectiveProvider(resolvedDeps);

  if (provider === "play") {
    await resolvedDeps.verifyPlayPurchase(app);
    return;
  }

  if (provider === "stripe") {
    await resolvedDeps.runStripeVerificationFlow(app);
    return;
  }

  const supported = resolvedDeps.getSupportedPurchaseProviders();
  const supportedText = supported.join(", ");
  app.notify(
    `${provider} verification is not enabled yet. Supported provider${supported.length === 1 ? "" : "s"}: ${supportedText}.`,
    "info"
  );
}

export async function closeStripeCheckoutFlow(
  app: StripeCheckoutApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  await resolvedDeps.closeStripeEmbeddedCheckout(app, { notifyCanceled: true });
}

export async function startPlayPurchaseFlow(
  app: PlayPurchaseApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
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
  const resetPurchaseInputs = () => {
    app.purchaseTokenInput = "";
    app.purchaseProductIdInput = "";
    app.purchasePackageNameInput = "";
    app.showVerifyPurchaseModal = false;
  };
  const tryRecoverExistingPurchase = async (
    attempts: number,
    successMessage: string
  ): Promise<boolean> => {
    if (!playBilling || typeof playBilling.listPurchases !== "function") {
      return false;
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const listedPurchases = await playBilling.listPurchases();
        const existing = resolvedDeps.extractPurchaseTokenFromResult(listedPurchases, productId);
        if (existing.purchaseToken) {
          const verified = await resolvedDeps.submitPlayPurchaseVerification(app, {
            baseUrl: base,
            googleIdToken,
            purchaseToken: existing.purchaseToken,
            productId
          });
          if (verified) {
            resetPurchaseInputs();
            app.notify(successMessage, "success");
            return true;
          }
        }
      } catch (error) {
        if (attempt === attempts - 1) {
          console.warn("[whatfees] Play purchase recovery failed", error);
        }
      }

      if (attempt < attempts - 1) {
        const delayMs = attempt === 0
          ? 0
          : Math.min(
            PLAY_PURCHASE_RECOVERY_MAX_DELAY_MS,
            PLAY_PURCHASE_RECOVERY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
          );
        if (delayMs > 0) {
          await resolvedDeps.sleep(delayMs);
        }
      }
    }

    return false;
  };

  try {
    playBilling = await resolvedDeps.getPlayBillingService();
    if (!playBilling && !resolvedDeps.isPlayBillingPaymentRequestSupported()) {
      app.notify("Google Play billing is not available in this environment.", "warning");
      return;
    }

    if (playBilling && typeof playBilling.listPurchases === "function") {
      const preCheckRecovered = await tryRecoverExistingPurchase(
        PLAY_PURCHASE_PRECHECK_ATTEMPTS,
        "Existing purchase found and verified. Pro features unlocked."
      );
      if (preCheckRecovered) {
        return;
      }
    }

    const purchase = await resolvedDeps.purchasePlayProduct(playBilling, productId);
    if (!purchase.purchaseToken) {
      const postPurchaseRecovered = await tryRecoverExistingPurchase(
        PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS,
        "Purchase verified. Pro features unlocked."
      );
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

    resetPurchaseInputs();
    app.notify("Purchase verified. Pro features unlocked.", "success");
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const isAbortError = name === "AbortError";
    const isAlreadyOwnedError = resolvedDeps.isAlreadyOwnedPurchaseError(error);
    const canTryRecovery = !!playBilling
      && typeof playBilling.listPurchases === "function"
      && (!isAbortError || isAlreadyOwnedError);

    if (canTryRecovery) {
      const recovered = await tryRecoverExistingPurchase(
        PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS,
        "Existing purchase found and verified. Pro features unlocked."
      );
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
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
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
    app.notify("Purchase verified. Pro features unlocked.", "success");
  } catch (error) {
    console.warn("[whatfees] Purchase verification error", error);
    app.notify("Could not verify purchase. Please try again.", "error");
  } finally {
    app.isVerifyingPurchase = false;
  }
}
