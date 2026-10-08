import {
  buildEntitlementDocumentId as canonicalEntitlementDocumentId,
  buildEntitlementScopeKey as canonicalEntitlementScopeKey,
  buildLegacyUserEntitlementDocumentId as canonicalLegacyEntitlementDocumentId,
  buildSyncScopePartitionKey as canonicalSyncScopePartitionKey,
  type ScopeType
} from "../shared/scope-keys.cjs";

export type { ScopeType } from "../shared/scope-keys.cjs";

// API boundaries accept unknown values and preserve 0, false and NaN as identifiers.
// Convert them before delegation to the shared string-input contract.
function normalizeScopeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function buildEntitlementScopeKey(scopeType: ScopeType, scopeId: unknown): string | null {
  return canonicalEntitlementScopeKey(scopeType, normalizeScopeId(scopeId));
}

export function buildEntitlementDocumentId(scopeType: ScopeType, scopeId: unknown): string | null {
  return canonicalEntitlementDocumentId(scopeType, normalizeScopeId(scopeId));
}

export function buildSyncScopePartitionKey(scopeType: ScopeType, scopeId: unknown): string | null {
  return canonicalSyncScopePartitionKey(scopeType, normalizeScopeId(scopeId));
}

export function buildLegacyUserEntitlementDocumentId(userId: unknown): string {
  return canonicalLegacyEntitlementDocumentId(normalizeScopeId(userId));
}
