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

export const uiEntitlementPurchaseMethods: UiEntitlementMethodSubset<
  "startProPurchase" | "verifyProPurchase" | "startPlayPurchase" | "verifyPlayPurchase"
> = {
  async startProPurchase(): Promise<void> {
    const provider = resolvePurchaseProvider();

    if (provider === "auto") {
      const playAvailable = await hasPlayPurchaseSupport();
      if (playAvailable) {
        await this.startPlayPurchase();
        return;
      }
      this.notify("Purchasing is not supported in this browser yet. Please use the Android app for now.", "info");
      return;
    }

    if (provider === "play") {
      await this.startPlayPurchase();
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
    const provider = resolvePurchaseProvider();

    if (provider === "auto") {
      const playAvailable = await hasPlayPurchaseSupport();
      if (playAvailable) {
        await this.verifyPlayPurchase();
        return;
      }
      this.notify("Purchase verification is not supported in this browser yet. Please use the Android app for now.", "info");
      return;
    }

    if (provider === "play") {
      await this.verifyPlayPurchase();
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
    if (!googleIdToken) {
      this.notify("Sign in with Google first to continue.", "warning");
      return;
    }

    const configuredProductId = (import.meta.env.VITE_PLAY_PRO_PRODUCT_ID as string | undefined)?.trim() || "";
    const productId = configuredProductId || this.purchaseProductIdInput.trim();
    if (!productId) {
      this.notify("Missing Play product configuration (VITE_PLAY_PRO_PRODUCT_ID).", "error");
      return;
    }

    this.isVerifyingPurchase = true;
    let playBilling: DigitalGoodsService | null = null;

    try {
      playBilling = await getPlayBillingService();
      if (!playBilling && !isPlayBillingPaymentRequestSupported()) {
        this.notify("Google Play billing is not available in this environment.", "warning");
        return;
      }

      if (playBilling && typeof playBilling.listPurchases === "function") {
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
              this.purchaseTokenInput = "";
              this.purchaseProductIdInput = "";
              this.purchasePackageNameInput = "";
              this.showVerifyPurchaseModal = false;
              this.notify("Existing purchase found and verified. Pro features unlocked.", "success");
              return;
            }
          }
        } catch (existingPurchaseError) {
          console.warn("[whatfees] Existing purchase pre-check failed", existingPurchaseError);
        }
      }

      const purchase = await purchasePlayProduct(playBilling, productId);
      if (!purchase.purchaseToken) {
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
              this.purchaseTokenInput = "";
              this.purchaseProductIdInput = "";
              this.purchasePackageNameInput = "";
              this.showVerifyPurchaseModal = false;
              this.notify("Existing purchase found and verified. Pro features unlocked.", "success");
              return;
            }
          }
        } catch (recoveryError) {
          console.warn("[whatfees] Play purchase recovery failed", recoveryError);
        }
      }

      if (isAbortError && !isAlreadyOwnedError) {
        this.notify("Purchase cancelled.", "info");
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
    if (!googleIdToken) {
      this.notify("Sign in with Google first to verify your purchase.", "warning");
      return;
    }

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
