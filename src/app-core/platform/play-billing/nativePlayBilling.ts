import { registerPlugin } from "@capacitor/core";
import {
  PlayBillingError,
  type PlayBillingErrorCode,
  type PlayBillingPort,
  type PlayPurchase
} from "./types.ts";

interface NativePlayBillingPlugin {
  isAvailable(): Promise<{ available?: unknown }>;
  listPurchases(): Promise<{ purchases?: unknown }>;
  purchase(options: { productId: string }): Promise<{ purchase?: unknown }>;
}

const nativePlugin = registerPlugin<NativePlayBillingPlugin>("WhatFeesPlayBilling");

function isErrorCode(value: unknown): value is PlayBillingErrorCode {
  return typeof value === "string" && [
    "cancelled",
    "already_owned",
    "disconnected",
    "not_available",
    "product_unavailable",
    "purchase_in_flight",
    "purchase_pending",
    "unknown"
  ].includes(value);
}

function normalizeNativeError(error: unknown): PlayBillingError {
  if (error instanceof PlayBillingError) return error;
  const candidate = typeof error === "object" && error !== null
    ? error as { code?: unknown; message?: unknown }
    : {};
  const code = isErrorCode(candidate.code) ? candidate.code : "unknown";
  const message = typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message
    : "Google Play billing failed.";
  return new PlayBillingError(code, message);
}

function normalizePurchase(value: unknown): PlayPurchase {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlayBillingError("unknown", "Google Play returned an invalid purchase.");
  }
  const purchase = value as Record<string, unknown>;
  const productId = typeof purchase.productId === "string" ? purchase.productId.trim() : "";
  const purchaseToken = typeof purchase.purchaseToken === "string"
    ? purchase.purchaseToken.trim()
    : "";
  const state = purchase.state === "purchased" || purchase.state === "pending"
    ? purchase.state
    : null;
  if (!productId || !purchaseToken || !state) {
    throw new PlayBillingError("unknown", "Google Play returned an incomplete purchase.");
  }
  return { productId, purchaseToken, state };
}

export function createNativePlayBillingPort(
  plugin: NativePlayBillingPlugin = nativePlugin
): PlayBillingPort {
  return {
    async isAvailable(): Promise<boolean> {
      try {
        return (await plugin.isAvailable()).available === true;
      } catch (error) {
        throw normalizeNativeError(error);
      }
    },
    async listPurchases(): Promise<PlayPurchase[]> {
      try {
        const result = await plugin.listPurchases();
        if (!Array.isArray(result.purchases)) return [];
        return result.purchases.map(normalizePurchase);
      } catch (error) {
        throw normalizeNativeError(error);
      }
    },
    async purchase(productId: string): Promise<PlayPurchase> {
      try {
        const result = await plugin.purchase({ productId });
        return normalizePurchase(result.purchase);
      } catch (error) {
        throw normalizeNativeError(error);
      }
    }
  };
}
