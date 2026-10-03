import type { BindingSummary, ShopifyBindingMode } from "../../shared/shopify-product-manager.ts";

export type ShopifyLotLink = { mode: ShopifyBindingMode; stale: boolean; disconnected: boolean; attention: boolean };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export function isShopifyLotLink(value: unknown): value is ShopifyLotLink {
  return record(value) && (value.mode === "linked" || value.mode === "managed") &&
    typeof value.stale === "boolean" && typeof value.disconnected === "boolean" && typeof value.attention === "boolean";
}

/** Validate a batch response before it can replace known link information. */
export function isBindingSummary(value: unknown): value is BindingSummary {
  if (!record(value) || typeof value.scopeKey !== "string" || !value.scopeKey.trim() ||
    (value.shop !== null && (typeof value.shop !== "string" || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value.shop))) ||
    !Number.isSafeInteger(value.generation) || Number(value.generation) < 0 ||
    typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.complete !== "boolean" || typeof value.connected !== "boolean" || !Array.isArray(value.bindings)) return false;
  if (value.shop === null && (value.connected || value.bindings.length)) return false;
  const ids = new Set<number>();
  for (const binding of value.bindings) {
    if (!record(binding) || !Number.isSafeInteger(binding.lotId) || Number(binding.lotId) <= 0 ||
      (binding.mode !== "linked" && binding.mode !== "managed") || typeof binding.version !== "string" ||
      !binding.version.trim() || binding.version.length > 512 || ids.has(Number(binding.lotId))) return false;
    ids.add(Number(binding.lotId));
  }
  return true;
}

/** A link badge describes the known binding, never stock or order reconciliation. */
export function projectShopifyLotLink(
  summary: BindingSummary | null, lotId: number,
  connection: { shop: string | null; status: string }, stale = false, attention = false
): ShopifyLotLink | undefined {
  if (!summary || (connection.shop && connection.shop !== summary.shop)) return undefined;
  const binding = summary.bindings.find(item => item.lotId === lotId);
  if (!binding) return undefined;
  const disconnected = connection.status === "disconnected" || (!summary.connected && connection.status !== "connected");
  return { mode: binding.mode, stale: stale || disconnected || connection.status !== "connected", disconnected, attention };
}
