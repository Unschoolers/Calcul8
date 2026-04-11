export type ScopeType = "user" | "workspace";

export function buildEntitlementScopeKey(scopeType: ScopeType, scopeId: string): string | null;
export function buildEntitlementDocumentId(scopeType: ScopeType, scopeId: string): string | null;
export function buildSyncScopePartitionKey(scopeType: ScopeType, scopeId: string): string | null;
export function buildLegacyUserEntitlementDocumentId(userId: string): string;