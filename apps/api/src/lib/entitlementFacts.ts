import type {
  EntitlementDocument,
  PlayPurchaseDocument,
  StripeEntitlementFactDocument
} from "../types";
import { hasValidProPurchase } from "./playEntitlements";

export interface DerivedEntitlementState {
  hasProAccess: boolean;
  purchaseSource: string | null;
  updatedAt: string;
}

export interface DeriveEntitlementStateInput {
  existingEntitlement?: EntitlementDocument | null;
  playPurchases: PlayPurchaseDocument[];
  stripeFacts: StripeEntitlementFactDocument[];
  allowedPlayProductIds: string[];
  now: string;
  allowLegacyFallback?: boolean;
}

function normalizePurchaseSource(source: string | null | undefined): string | null {
  const normalized = String(source || "").trim();
  return normalized || null;
}

function hasActiveStripeFact(facts: StripeEntitlementFactDocument[]): boolean {
  return facts.some((fact) => fact.active);
}

export function deriveEntitlementState(input: DeriveEntitlementStateInput): DerivedEntitlementState {
  if (hasValidProPurchase(input.playPurchases, input.allowedPlayProductIds)) {
    return {
      hasProAccess: true,
      purchaseSource: "google_play",
      updatedAt: input.now
    };
  }

  if (hasActiveStripeFact(input.stripeFacts)) {
    return {
      hasProAccess: true,
      purchaseSource: "stripe",
      updatedAt: input.now
    };
  }

  if (input.allowLegacyFallback && input.existingEntitlement?.hasProAccess) {
    return {
      hasProAccess: true,
      purchaseSource: normalizePurchaseSource(input.existingEntitlement.purchaseSource),
      updatedAt: input.existingEntitlement.updatedAt
    };
  }

  return {
    hasProAccess: false,
    purchaseSource: null,
    updatedAt: input.now
  };
}

export function entitlementStateMatches(
  entitlement: EntitlementDocument,
  state: Pick<DerivedEntitlementState, "hasProAccess" | "purchaseSource">
): boolean {
  return (
    entitlement.hasProAccess === state.hasProAccess
    && normalizePurchaseSource(entitlement.purchaseSource) === state.purchaseSource
  );
}
