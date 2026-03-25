import { HttpError } from "../lib/auth";
import {
  createWhatnotOAuthState,
  deleteWhatnotConnection,
  getLatestPendingWhatnotImportBatch,
  getWhatnotConnection,
  getWhatnotImportBatch,
  upsertWhatnotConnection
} from "../lib/cosmos/whatnotRepository";
import {
  buildWhatnotAuthorizeUrl,
  exchangeWhatnotAuthorizationCode,
  fetchWhatnotSellerIdentity,
  resolveWhatnotAppCallbackUrl
} from "../lib/whatnot";
import type { ApiConfig, WhatnotImportBatchDocument } from "../types";
import {
  WHATNOT_OAUTH_STATE_TTL_MS,
  createOAuthStateToken,
  createOrConsumeValidOAuthState,
  normalizeId,
  normalizeValidatedAppReturnUrl,
  parseWhatnotConfigured,
  resolveWhatnotScope
} from "./whatnot-service-core";

export async function getWhatnotStatusForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
): Promise<{
  configured: boolean;
  connected: boolean;
  displayName: string;
  externalAccountId: string;
  scopes: string[];
  lastSyncedAt: string | null;
  pendingReviewCount: number;
  pendingBatchId: string | null;
}> {
  const scope = await resolveWhatnotScope(config, actorUserId, workspaceId, false);
  const [connection, pendingBatch] = await Promise.all([
    getWhatnotConnection(config, scope.connectionScopeKey),
    getLatestPendingWhatnotImportBatch(config, scope.partitionKey)
  ]);
  return {
    configured: parseWhatnotConfigured(config),
    connected: !!connection && connection.status === "active",
    displayName: connection?.externalDisplayName ?? "",
    externalAccountId: connection?.externalAccountId ?? "",
    scopes: Array.isArray(connection?.scopes) ? connection!.scopes : [],
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    pendingReviewCount: pendingBatch?.rows.length ?? 0,
    pendingBatchId: pendingBatch?.batchId ?? null
  };
}

export async function createWhatnotConnectUrlForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string,
  appReturnUrl?: string
): Promise<string> {
  if (!parseWhatnotConfigured(config)) {
    throw new HttpError(503, "Whatnot integration is not configured.");
  }
  const scope = await resolveWhatnotScope(config, actorUserId, workspaceId, Boolean(workspaceId));
  const validatedAppReturnUrl = normalizeValidatedAppReturnUrl(config, appReturnUrl);
  const state = createOAuthStateToken();
  const now = new Date().toISOString();
  await createWhatnotOAuthState(config, {
    provider: "whatnot",
    state,
    scopeKey: scope.connectionScopeKey,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    appReturnUrl: validatedAppReturnUrl,
    createdByUserId: actorUserId,
    expiresAt: new Date(Date.now() + WHATNOT_OAUTH_STATE_TTL_MS).toISOString(),
    createdAt: now,
    updatedAt: now
  });
  return buildWhatnotAuthorizeUrl(config, state);
}

export async function handleWhatnotOAuthCallback(
  config: ApiConfig,
  input: {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
  }
): Promise<{ redirectUrl: string }> {
  if (input.error) {
    let callbackScopeType: "user" | "workspace" = "user";
    let callbackAppReturnUrl: string | undefined;
    const pendingState = normalizeId(input.state);
    if (pendingState) {
      try {
        const oauthState = await createOrConsumeValidOAuthState(config, pendingState);
        callbackScopeType = oauthState.scopeType;
        callbackAppReturnUrl = oauthState.appReturnUrl;
      } catch {
        // Fall back to default callback target when the OAuth state is unavailable.
      }
    }
    return {
      redirectUrl: resolveWhatnotAppCallbackUrl(
        config,
        "error",
        callbackScopeType,
        input.errorDescription || input.error,
        callbackAppReturnUrl
      )
    };
  }

  const state = normalizeId(input.state);
  const code = normalizeId(input.code);
  if (!state || !code) {
    throw new HttpError(400, "Whatnot OAuth callback is missing required parameters.");
  }

  const oauthState = await createOrConsumeValidOAuthState(config, state);
  const tokens = await exchangeWhatnotAuthorizationCode(config, code);
  const identity = await fetchWhatnotSellerIdentity(config, tokens.accessToken);
  await upsertWhatnotConnection(config, {
    id: "",
    docType: "whatnot_connection",
    userId: oauthState.scopeKey,
    scopeKey: oauthState.scopeKey,
    scopeType: oauthState.scopeType,
    scopeId: oauthState.scopeId,
    provider: "whatnot",
    externalAccountId: identity.externalAccountId,
    externalDisplayName: identity.externalDisplayName,
    scopes: tokens.scopes,
    accessTokenCiphertext: tokens.accessToken,
    refreshTokenCiphertext: tokens.refreshToken,
    tokenExpiresAt: tokens.tokenExpiresAt,
    connectedByUserId: oauthState.createdByUserId,
    updatedAt: new Date().toISOString(),
    status: "active"
  });

  return {
    redirectUrl: resolveWhatnotAppCallbackUrl(
      config,
      "connected",
      oauthState.scopeType,
      undefined,
      oauthState.appReturnUrl
    )
  };
}

export async function disconnectWhatnotForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
): Promise<void> {
  const scope = await resolveWhatnotScope(config, actorUserId, workspaceId, Boolean(workspaceId));
  await deleteWhatnotConnection(config, scope.connectionScopeKey);
}

export async function getWhatnotReviewBatchForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string,
  batchId?: string
): Promise<WhatnotImportBatchDocument | null> {
  const scope = await resolveWhatnotScope(config, actorUserId, workspaceId, false);
  const normalizedBatchId = normalizeId(batchId);
  if (normalizedBatchId) {
    return getWhatnotImportBatch(config, scope.partitionKey, normalizedBatchId);
  }
  return getLatestPendingWhatnotImportBatch(config, scope.partitionKey);
}
