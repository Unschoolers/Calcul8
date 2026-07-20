import { createHash } from "node:crypto";
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

export function stripeEntitlementFactId(userId: string, objectType: string, objectId: string): string {
  return `stripe_entitlement:${userId}:${objectType}:${objectId}`;
}

export function stripeProcessedEventId(stripeEventId: string): string {
  return `stripe_event:${stripeEventId}`;
}

export function stripeProcessedEventPartitionKey(stripeEventId: string): string {
  return stripeProcessedEventId(stripeEventId);
}

export function playPurchaseTokenClaimId(purchaseTokenHash: string): string {
  return `play_purchase_token_claim:${purchaseTokenHash}`;
}

export function playPurchaseTokenClaimPartitionKey(purchaseTokenHash: string): string {
  return `play_token:${purchaseTokenHash}`;
}

export function userProfileId(userId: string): string {
  return `profile:${userId}`;
}

export function whatnotConnectionId(scopeKey: string): string {
  return `whatnot_connection:${scopeKey}`;
}

export function whatnotOAuthStateId(state: string): string {
  return `whatnot_oauth_state:${state}`;
}

export function whatnotImportBatchId(scopeKey: string, batchId: string): string {
  return `whatnot_import_batch:${scopeKey}:${batchId}`;
}

export function whatnotTargetMappingId(scopeKey: string, matchKeyHash: string): string {
  return `whatnot_target_mapping:${scopeKey}:${matchKeyHash}`;
}

export function whatnotSaleImportMappingId(scopeKey: string, externalSaleKeyHash: string): string {
  return `whatnot_sale_import_mapping:${scopeKey}:${externalSaleKeyHash}`;
}

export function syncSnapshotId(userId: string): string {
  return `sync:${userId}`;
}

export function syncPresetId(userId: string, presetId: string): string {
  return `sync:preset:${userId}:${presetId}`;
}

export function syncPresetSetId(userId: string, presetSetId: string, presetId: string): string {
  return `sync:preset-set:${userId}:${presetSetId}:${presetId}`;
}

export function syncMetaId(userId: string): string {
  return `sync:meta:${userId}`;
}

export function saleDocumentId(scopeKey: string, lotId: string, saleId: string): string {
  return `sale:${scopeKey}:${lotId}:${saleId}`;
}

export function lotLivePricingDocumentId(scopeKey: string, lotId: string): string {
  return `lot_live_pricing:${scopeKey}:${lotId}`;
}

export function buyerProfileDocumentId(normalizedUsername: string): string {
  const digest = createHash("sha256")
    .update(String(normalizedUsername ?? "").trim().toLocaleLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `buyer_profile:${digest}`;
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

export function gamePublicSessionDocumentId(publicSessionId: string): string {
  return `wheel_public_session:${publicSessionId}`;
}

export function wheelPublicSessionDocumentId(publicSessionId: string): string {
  return gamePublicSessionDocumentId(publicSessionId);
}

export function wheelFairnessProofDocumentId(proofId: string): string {
  return `wheel_fairness_proof:${proofId}`;
}
