// Generated from shared/contracts/scope-keys.ts. Run npm run shared:generate.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEntitlementScopeKey = buildEntitlementScopeKey;
exports.buildEntitlementDocumentId = buildEntitlementDocumentId;
exports.buildSyncScopePartitionKey = buildSyncScopePartitionKey;
exports.buildLegacyUserEntitlementDocumentId = buildLegacyUserEntitlementDocumentId;
function normalizeScopeId(raw) {
    return String(raw || "").trim();
}
function buildEntitlementScopeKey(scopeType, scopeId) {
    const normalizedScopeId = normalizeScopeId(scopeId);
    if (!normalizedScopeId)
        return null;
    return scopeType === "workspace"
        ? `ws:${normalizedScopeId}`
        : `user:${normalizedScopeId}`;
}
function buildEntitlementDocumentId(scopeType, scopeId) {
    const scopeKey = buildEntitlementScopeKey(scopeType, scopeId);
    if (!scopeKey)
        return null;
    return `entitlement:${scopeKey}`;
}
function buildSyncScopePartitionKey(scopeType, scopeId) {
    const normalizedScopeId = normalizeScopeId(scopeId);
    if (!normalizedScopeId)
        return null;
    return scopeType === "workspace"
        ? `ws:${normalizedScopeId}`
        : `u:${normalizedScopeId}`;
}
function buildLegacyUserEntitlementDocumentId(userId) {
    return `entitlement:${normalizeScopeId(userId)}`;
}
