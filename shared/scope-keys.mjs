function normalizeScopeId(raw) {
  return String(raw || "").trim();
}

export function buildEntitlementScopeKey(scopeType, scopeId) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (!normalizedScopeId) return null;
  return scopeType === "workspace"
    ? `ws:${normalizedScopeId}`
    : `user:${normalizedScopeId}`;
}

export function buildEntitlementDocumentId(scopeType, scopeId) {
  const scopeKey = buildEntitlementScopeKey(scopeType, scopeId);
  if (!scopeKey) return null;
  return `entitlement:${scopeKey}`;
}

export function buildSyncScopePartitionKey(scopeType, scopeId) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (!normalizedScopeId) return null;
  return scopeType === "workspace"
    ? `ws:${normalizedScopeId}`
    : `u:${normalizedScopeId}`;
}

export function buildLegacyUserEntitlementDocumentId(userId) {
  return `entitlement:${normalizeScopeId(userId)}`;
}