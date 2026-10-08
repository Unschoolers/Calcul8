// Generated from shared/contracts/scope-keys.ts. Run npm run shared:generate.
export type ScopeType = "user" | "workspace";
export declare function buildEntitlementScopeKey(scopeType: ScopeType, scopeId: string): string | null;
export declare function buildEntitlementDocumentId(scopeType: ScopeType, scopeId: string): string | null;
export declare function buildSyncScopePartitionKey(scopeType: ScopeType, scopeId: string): string | null;
export declare function buildLegacyUserEntitlementDocumentId(userId: string): string;
