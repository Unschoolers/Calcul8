import {
  getSupportedPurchaseProviders,
  resolvePurchaseProvider
} from "../common/shared.ts";
import { hasPlayPurchaseSupport } from "./entitlements-shared.ts";
import type {
  PurchaseProvider,
  PurchaseRoutingApp
} from "./entitlements-purchase-types.ts";

export type PurchaseProviderDeps = {
  resolvePurchaseProvider: () => PurchaseProvider;
  hasPlayPurchaseSupport: typeof hasPlayPurchaseSupport;
  getSupportedPurchaseProviders: typeof getSupportedPurchaseProviders;
};

export const defaultPurchaseProviderDeps: PurchaseProviderDeps = {
  resolvePurchaseProvider,
  hasPlayPurchaseSupport,
  getSupportedPurchaseProviders
};

export async function resolveEffectivePurchaseProvider(
  deps: PurchaseProviderDeps
): Promise<PurchaseProvider> {
  const configuredProvider = deps.resolvePurchaseProvider();
  if (configuredProvider !== "auto") {
    return configuredProvider;
  }
  return (await deps.hasPlayPurchaseSupport()) ? "play" : "stripe";
}

export function notifyUnsupportedPurchaseProvider(
  app: Pick<PurchaseRoutingApp, "notify">,
  provider: PurchaseProvider,
  capabilityLabel: "purchases" | "verification",
  deps: Pick<PurchaseProviderDeps, "getSupportedPurchaseProviders">
): void {
  const supported = deps.getSupportedPurchaseProviders();
  const supportedText = supported.join(", ");
  app.notify(
    `${provider} ${capabilityLabel} are not enabled yet. Supported provider${supported.length === 1 ? "" : "s"}: ${supportedText}.`,
    "info"
  );
}
