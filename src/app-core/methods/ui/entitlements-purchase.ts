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
  isAlreadyOwnedPurchaseError,
  type UiEntitlementMethodSubset
} from "./entitlements-shared.ts";
import { runStripePurchaseFlow, runStripeVerificationFlow } from "./entitlements-stripe.ts";

const PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS = 10;
const PLAY_PURCHASE_RECOVERY_BASE_DELAY_MS = 250;
const PLAY_PURCHASE_RECOVERY_MAX_DELAY_MS = 1200;
const PLAY_PURCHASE_PRECHECK_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export const uiEntitlementPurchaseMethods: UiEntitlementMethodSubset<
  "startProPurchase" | "verifyProPurchase" | "startPlayPurchase" | "verifyPlayPurchase"
> = {
  async startProPurchase(): Promise<void> {
    const configuredProvider = resolvePurchaseProvider();
    const provider = configuredProvider === "auto"
      ? ((await hasPlayPurchaseSupport()) ? "play" : "stripe")
      : configuredProvider;

    if (provider === "play") {
      await this.startPlayPurchase();
      return;
    }

    if (provider === "stripe") {
      await runStripePurchaseFlow(this);
      return;
    }

    const supported = getSupportedPurchaseProviders();
    const supportedText = supported.join(", ");
    this.notify(
      `${provider} purchases are not enabled yet. Supported provider${supported.length === 1 ? "" : "s"}: ${supportedText}.`,
      "info"
    );
  },

  async verifyProPurchase(): Promise<void> {
    const configuredProvider = resolvePurchaseProvider();
    const provider = configuredProvider === "auto"
      ? ((await hasPlayPurchaseSupport()) ? "play" : "stripe")
      : configuredProvider;

    if (provider === "play") {
      await this.verifyPlayPurchase();
      return;
    }

    if (provider === "stripe") {
      await runStripeVerificationFlow(this);
      return;
    }

    const supported = getSupportedPurchaseProviders();
    const supportedText = supported.join(", ");
    this.notify(
      `${provider} verification is not enabled yet. Supported provider${supported.length === 1 ? "" : "s"}: ${supportedText}.`,
      "info"
    );
  },

  async startPlayPurchase(): Promise<void> {
    if (this.isVerifyingPurchase) {
      return;
    }

    if (this.hasProAccess) {
      this.notify("Pro is already unlocked on this account.", "info");
      return;
    }

    const base = resolveApiBaseUrl();
    if (!base) {
      this.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const configuredProductId = (import.meta.env.VITE_PLAY_PRO_PRODUCT_ID as string | undefined)?.trim() || "";
    const productId = configuredProductId || this.purchaseProductIdInput.trim();
    if (!productId) {
      this.notify("Missing Play product configuration (VITE_PLAY_PRO_PRODUCT_ID).", "error");
      return;
    }

    this.isVerifyingPurchase = true;
    let playBilling: DigitalGoodsService | null = null;
    const resetPurchaseInputs = () => {
      this.purchaseTokenInput = "";
      this.purchaseProductIdInput = "";
      this.purchasePackageNameInput = "";
      this.showVerifyPurchaseModal = false;
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
          const existing = extractPurchaseTokenFromResult(listedPurchases, productId);
          if (existing.purchaseToken) {
            const verified = await submitPlayPurchaseVerification(this, {
              baseUrl: base,
              googleIdToken,
              purchaseToken: existing.purchaseToken,
              productId
            });
            if (verified) {
              resetPurchaseInputs();
              this.notify(successMessage, "success");
              return true;
            }
          }
        } catch (error) {
          if (attempt === attempts - 1) {
            console.warn("[whatfees] Play purchase recovery failed", error);
          }
        }

        if (attempt < attempts - 1) {
          // Try once more immediately, then back off to let Play purchase records propagate.
          const delayMs = attempt === 0
            ? 0
            : Math.min(
              PLAY_PURCHASE_RECOVERY_MAX_DELAY_MS,
              PLAY_PURCHASE_RECOVERY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
            );
          if (delayMs > 0) {
            await sleep(delayMs);
          }
        }
      }

      return false;
    };

    try {
      playBilling = await getPlayBillingService();
      if (!playBilling && !isPlayBillingPaymentRequestSupported()) {
        this.notify("Google Play billing is not available in this environment.", "warning");
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

      const purchase = await purchasePlayProduct(playBilling, productId);
      if (!purchase.purchaseToken) {
        const postPurchaseRecovered = await tryRecoverExistingPurchase(
          PLAY_PURCHASE_RECOVERY_MAX_ATTEMPTS,
          "Purchase verified. Pro features unlocked."
        );
        if (postPurchaseRecovered) {
          return;
        }
        this.notify("Could not read purchase token from Google Play.", "error");
        return;
      }

      const verified = await submitPlayPurchaseVerification(this, {
        baseUrl: base,
        googleIdToken,
        purchaseToken: purchase.purchaseToken,
        productId
      });
      if (!verified) return;

      this.purchaseTokenInput = "";
      this.purchaseProductIdInput = "";
      this.purchasePackageNameInput = "";
      this.showVerifyPurchaseModal = false;
      this.notify("Purchase verified. Pro features unlocked.", "success");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const isAbortError = name === "AbortError";
      const isAlreadyOwnedError = isAlreadyOwnedPurchaseError(error);
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
        this.notify("Purchase cancelled.", "info");
        return;
      }

      if (isAlreadyOwnedError) {
        this.notify("Google Play still syncing this purchase. Please wait a few seconds and try again.", "info");
        return;
      }

      console.warn("[whatfees] Play purchase error", error);
      const detail = formatPlayPurchaseError(error);
      this.notify(`Could not complete Google Play purchase. ${detail}`, "error");
    } finally {
      this.isVerifyingPurchase = false;
    }
  },

  async verifyPlayPurchase(): Promise<void> {
    if (this.isVerifyingPurchase) {
      return;
    }

    const base = resolveApiBaseUrl();
    if (!base) {
      this.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
      return;
    }

    const purchaseToken = this.purchaseTokenInput.trim();
    if (!purchaseToken) {
      this.notify("Enter a purchase token to continue.", "warning");
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    this.isVerifyingPurchase = true;

    try {
      const verified = await submitPlayPurchaseVerification(this, {
        baseUrl: base,
        googleIdToken,
        purchaseToken,
        productId: this.purchaseProductIdInput.trim(),
        packageName: this.purchasePackageNameInput.trim()
      });
      if (!verified) return;
      this.purchaseTokenInput = "";
      this.showVerifyPurchaseModal = false;
      this.notify("Purchase verified. Pro features unlocked.", "success");
    } catch (error) {
      console.warn("[whatfees] Purchase verification error", error);
      this.notify("Could not verify purchase. Please try again.", "error");
    } finally {
      this.isVerifyingPurchase = false;
    }
  }
};
