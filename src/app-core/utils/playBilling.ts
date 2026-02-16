export const PLAY_BILLING_SERVICE_PROVIDER = "https://play.google.com/billing";

export interface DigitalGoodsService {
  purchase?: (itemId: string) => Promise<unknown>;
  listPurchases?: () => Promise<unknown>;
}

interface DigitalGoodsWindow {
  getDigitalGoodsService?: (serviceProvider: string) => Promise<DigitalGoodsService>;
  PaymentRequest?: typeof PaymentRequest;
}

declare global {
  interface Window extends DigitalGoodsWindow {}
}

export interface PlayPurchaseTokenResult {
  purchaseToken: string | null;
  itemId: string | null;
}

interface PurchaseLike {
  itemId?: unknown;
  purchaseToken?: unknown;
  token?: unknown;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePurchaseLike(value: unknown): PlayPurchaseTokenResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { purchaseToken: null, itemId: null };
  }

  const candidate = value as PurchaseLike;
  const purchaseToken = normalizeString(candidate.purchaseToken) ?? normalizeString(candidate.token);
  const itemId = normalizeString(candidate.itemId);

  return {
    purchaseToken,
    itemId
  };
}

function toPurchaseResultArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [value];
}

export function extractPurchaseTokenFromResult(
  value: unknown,
  preferredItemId?: string
): PlayPurchaseTokenResult {
  const preferred = normalizeString(preferredItemId);
  const results = toPurchaseResultArray(value)
    .map(normalizePurchaseLike)
    .filter((item) => item.purchaseToken);

  if (results.length === 0) {
    return { purchaseToken: null, itemId: null };
  }

  if (preferred) {
    const preferredResult = results.find((result) => result.itemId === preferred);
    if (preferredResult) {
      return preferredResult;
    }
  }

  return results[0];
}

export async function getPlayBillingService(
  win: DigitalGoodsWindow = window
): Promise<DigitalGoodsService | null> {
  if (typeof win.getDigitalGoodsService !== "function") {
    return null;
  }

  try {
    return await win.getDigitalGoodsService(PLAY_BILLING_SERVICE_PROVIDER);
  } catch {
    return null;
  }
}

export function isPlayBillingPaymentRequestSupported(
  win: DigitalGoodsWindow = window
): boolean {
  return typeof win.PaymentRequest === "function";
}

async function purchaseViaPaymentRequest(
  productId: string,
  win: DigitalGoodsWindow = window
): Promise<unknown> {
  if (!isPlayBillingPaymentRequestSupported(win)) {
    throw new Error("PaymentRequest API is not available in this environment.");
  }

  const request = new win.PaymentRequest(
    [
      {
        supportedMethods: PLAY_BILLING_SERVICE_PROVIDER,
        // Google Play Billing PaymentRequest requires SKU in method data.
        data: { sku: productId, skuId: productId }
      }
    ],
    {
      total: {
        label: "WhatFees Pro",
        amount: {
          currency: "USD",
          value: "0.00"
        }
      }
    }
  );

  const response = await request.show();
  try {
    if (typeof response === "object" && response !== null) {
      const details = (response as { details?: unknown }).details;
      if (details != null) {
        return details;
      }
    }
    return response;
  } finally {
    try {
      if (
        typeof response === "object" &&
        response !== null &&
        typeof (response as { complete?: unknown }).complete === "function"
      ) {
        await (response as { complete: (status: PaymentComplete) => Promise<void> }).complete("success");
      }
    } catch {
      // Ignore completion errors from platform/browser implementations.
    }
  }
}

export async function purchasePlayProduct(
  service: DigitalGoodsService | null,
  productId: string,
  win: DigitalGoodsWindow = window
): Promise<PlayPurchaseTokenResult> {
  const purchaseResult = service && typeof service.purchase === "function"
    ? await service.purchase(productId)
    : await purchaseViaPaymentRequest(productId, win);

  const tokenFromPurchase = extractPurchaseTokenFromResult(purchaseResult, productId);
  if (tokenFromPurchase.purchaseToken) {
    return tokenFromPurchase;
  }

  if (!service || typeof service.listPurchases !== "function") {
    return tokenFromPurchase;
  }

  const listedPurchases = await service.listPurchases();
  return extractPurchaseTokenFromResult(listedPurchases, productId);
}
