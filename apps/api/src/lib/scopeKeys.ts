export type ScopeType = "user" | "workspace";

function normalizeScopeId(raw: string): string {
  return String(raw || "").trim();
}

export function buildEntitlementScopeKey(scopeType: ScopeType, scopeId: string): string | null {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (!normalizedScopeId) return null;
  return scopeType === "workspace"
    ? `ws:${normalizedScopeId}`
    : `user:${normalizedScopeId}`;
}

export function buildEntitlementDocumentId(scopeType: ScopeType, scopeId: string): string | null {
  const scopeKey = buildEntitlementScopeKey(scopeType, scopeId);
  if (!scopeKey) return null;
  return `entitlement:${scopeKey}`;
}

export function buildSyncScopePartitionKey(scopeType: ScopeType, scopeId: string): string | null {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (!normalizedScopeId) return null;
  return scopeType === "workspace"
    ? `ws:${normalizedScopeId}`
    : `u:${normalizedScopeId}`;
}

export function buildLegacyUserEntitlementDocumentId(userId: string): string {
  return `entitlement:${normalizeScopeId(userId)}`;
}
