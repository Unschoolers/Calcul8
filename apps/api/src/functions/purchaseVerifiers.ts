import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { ApiConfig } from "../types";
import { verifyPlayEntitlementRequest } from "./entitlementsVerifyPlay";

type PurchaseVerifier = (
  request: HttpRequest,
  context: InvocationContext,
  config: ApiConfig,
  routeLabel: string
) => Promise<HttpResponseInit>;

const PURCHASE_VERIFIERS: Record<string, PurchaseVerifier> = {
  play: verifyPlayEntitlementRequest
};

export function resolvePurchaseVerifier(provider: string): PurchaseVerifier | null {
  const normalizedProvider = provider.trim().toLowerCase();
  return PURCHASE_VERIFIERS[normalizedProvider] ?? null;
}

export function getSupportedPurchaseProviders(): string[] {
  return Object.keys(PURCHASE_VERIFIERS);
}

