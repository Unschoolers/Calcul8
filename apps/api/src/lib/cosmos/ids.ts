import { buildLegacyUserEntitlementDocumentId, buildSyncScopePartitionKey } from "../scopeKeys";

export function entitlementId(userId: string): string {
  return buildLegacyUserEntitlementDocumentId(userId);
}

export function playPurchaseId(purchaseTokenHash: string): string {
  return `play_purchase:${purchaseTokenHash}`;
}

export function purchaseVerificationResultId(userId: string, provider: string, idempotencyKey: string): string {
  return `purchase_verify:${userId}:${provider}:${idempotencyKey}`;
}

export function syncSnapshotId(userId: string): string {
  return `sync:${userId}`;
}

export function syncPresetId(userId: string, presetId: string): string {
  return `sync:preset:${userId}:${presetId}`;
}

export function syncMetaId(userId: string): string {
  return `sync:meta:${userId}`;
}

export function migrationMarkerId(migrationId: string): string {
  return `migration_marker:${migrationId}`;
}

export function workspaceMembershipId(userId: string, workspaceId: string): string {
  return `m:${userId}:${workspaceId}`;
}

export function workspaceDocumentId(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function workspaceJoinLinkId(inviteId: string): string {
  return `join_link:${inviteId}`;
}

export function workspaceDocumentPartitionKey(workspaceId: string): string {
  return buildSyncScopePartitionKey("workspace", workspaceId) ?? `ws:${workspaceId}`;
}
