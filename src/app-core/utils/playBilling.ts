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
  productId?: unknown;
  sku?: unknown;
  skuId?: unknown;
  purchaseToken?: unknown;
  token?: unknown;
  purchase_data?: unknown;
  purchaseData?: unknown;
  details?: unknown;
  data?: unknown;
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
  const itemId = normalizeString(candidate.itemId)
    ?? normalizeString(candidate.productId)
    ?? normalizeString(candidate.sku)
    ?? normalizeString(candidate.skuId);
  const explicitPurchaseToken = normalizeString(candidate.purchaseToken);
  const genericToken = normalizeString(candidate.token);
  // Some payloads contain unrelated generic "token" fields (auth/session tokens).
  // Only treat generic token as a purchase token when the same object also identifies an item.
  const purchaseToken = explicitPurchaseToken ?? (itemId ? genericToken : null);

  return {
    purchaseToken,
    itemId
  };
}

function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectPurchaseCandidates(
  value: unknown,
  output: PlayPurchaseTokenResult[],
  seen: Set<object>,
  depth = 0
): void {
  if (depth > 6 || value == null) return;

  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed != null) {
      collectPurchaseCandidates(parsed, output, seen, depth + 1);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPurchaseCandidates(item, output, seen, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) return;
  seen.add(value);

  output.push(normalizePurchaseLike(value));

  const record = value as Record<string, unknown>;
  for (const nested of Object.values(record)) {
    collectPurchaseCandidates(nested, output, seen, depth + 1);
  }
}

export function extractPurchaseTokenFromResult(
  value: unknown,
  preferredItemId?: string
): PlayPurchaseTokenResult {
  const preferred = normalizeString(preferredItemId);
  const candidates: PlayPurchaseTokenResult[] = [];
  collectPurchaseCandidates(value, candidates, new Set<object>());
  const results = candidates.filter((item) => item.purchaseToken);

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
