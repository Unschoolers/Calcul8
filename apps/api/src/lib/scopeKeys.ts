export type ScopeType = "workspace" | "user";

function normalizeScopeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function buildEntitlementScopeKey(
  scopeType: ScopeType,
  scopeId: unknown
): string | null {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (!normalizedScopeId) return null;

  return scopeType === "workspace"
    ? `ws:${normalizedScopeId}`
    : `user:${normalizedScopeId}`;
}

export function buildEntitlementDocumentId(
  scopeType: ScopeType,
  scopeId: unknown
): string | null {
  const scopeKey = buildEntitlementScopeKey(scopeType, scopeId);
  if (!scopeKey) return null;
  return `entitlement:${scopeKey}`;
}

export function buildSyncScopePartitionKey(
  scopeType: ScopeType,
  scopeId: unknown
): string | null {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (!normalizedScopeId) return null;

  return scopeType === "workspace"
    ? `ws:${normalizedScopeId}`
    : `u:${normalizedScopeId}`;
}

export function buildLegacyUserEntitlementDocumentId(userId: unknown): string {
  return `entitlement:${normalizeScopeId(userId)}`;
}
