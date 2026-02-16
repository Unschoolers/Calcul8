export const PLAY_BILLING_SERVICE_PROVIDER = "https://play.google.com/billing";

export interface DigitalGoodsService {
  purchase(itemId: string): Promise<unknown>;
  listPurchases?: () => Promise<unknown>;
}

interface DigitalGoodsWindow {
  getDigitalGoodsService?: (serviceProvider: string) => Promise<DigitalGoodsService>;
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

export async function purchasePlayProduct(
  service: DigitalGoodsService,
  productId: string
): Promise<PlayPurchaseTokenResult> {
  const purchaseResult = await service.purchase(productId);
  const tokenFromPurchase = extractPurchaseTokenFromResult(purchaseResult, productId);
  if (tokenFromPurchase.purchaseToken) {
    return tokenFromPurchase;
  }

  if (typeof service.listPurchases !== "function") {
    return tokenFromPurchase;
  }

  const listedPurchases = await service.listPurchases();
  return extractPurchaseTokenFromResult(listedPurchases, productId);
}
