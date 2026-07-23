import {
  extractPurchaseTokenFromResult,
  getPlayBillingService,
  isPlayBillingPaymentRequestSupported,
  purchasePlayProduct,
  type DigitalGoodsService
} from "../../utils/playBilling.ts";
import {
  PlayBillingError,
  type PlayBillingPort,
  type PlayPurchase
} from "./types.ts";

interface WebPlayBillingDependencies {
  getService: () => Promise<DigitalGoodsService | null>;
  supportsPaymentRequest: () => boolean;
}

const defaultDependencies: WebPlayBillingDependencies = {
  getService: () => getPlayBillingService(),
  supportsPaymentRequest: () => isPlayBillingPaymentRequestSupported()
};

function normalizePurchase(value: unknown, preferredProductId?: string): PlayPurchase | null {
  const result = extractPurchaseTokenFromResult(value, preferredProductId);
  if (!result.purchaseToken || !result.itemId) return null;
  return {
    productId: result.itemId,
    purchaseToken: result.purchaseToken,
    state: "purchased"
  };
}

function translateWebPurchaseError(error: unknown): never {
  if (error instanceof Error && error.name === "AbortError") {
    throw new PlayBillingError("cancelled", "Purchase cancelled.");
  }
  throw error;
}

export async function createWebPlayBillingPort(
  dependencies: Partial<WebPlayBillingDependencies> = {}
): Promise<PlayBillingPort | null> {
  const resolved = { ...defaultDependencies, ...dependencies };
  const service = await resolved.getService();
  const paymentRequestSupported = resolved.supportsPaymentRequest();
  if (!service && !paymentRequestSupported) return null;

  return {
    async isAvailable(): Promise<boolean> {
      return true;
    },
    async listPurchases(): Promise<PlayPurchase[]> {
      if (typeof service?.listPurchases !== "function") return [];
      const result = await service.listPurchases();
      const values = Array.isArray(result) ? result : [result];
      return values
        .map((value) => normalizePurchase(value))
        .filter((purchase): purchase is PlayPurchase => purchase !== null);
    },
    async purchase(productId: string): Promise<PlayPurchase> {
      try {
        const result = await purchasePlayProduct(service, productId);
        const purchase = normalizePurchase(result, productId);
        if (!purchase) {
          throw new PlayBillingError(
            "product_unavailable",
            "Google Play did not return a purchase token."
          );
        }
        return purchase;
      } catch (error) {
        translateWebPurchaseError(error);
      }
    }
  };
}
