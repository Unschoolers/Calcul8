import { randomBytes } from "node:crypto";
import { HttpError } from "../../lib/auth";
import {
  consumeWhatnotOAuthState,
  upsertWhatnotConnection
} from "../../lib/cosmos/whatnotRepository";
import { getWorkspaceMembership, hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import { refreshWhatnotAccessToken } from "../../lib/whatnot";
import { resolveSyncScope } from "../../lib/syncScopeResolution";
import type {
  ApiConfig,
  WhatnotConnectionDocument,
  WhatnotMappedSaleType,
  WhatnotImportDecisionKind,
  WhatnotReviewImportAction,
  WhatnotNormalizedImportRowInput
} from "../../types";

export const WHATNOT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const INITIAL_SYNC_WINDOW_DAYS = 90;
const INCREMENTAL_SYNC_OVERLAP_MS = 24 * 60 * 60 * 1000;
export const MAX_SYNC_ROWS = 250;

export type ResolvedWhatnotScope = ReturnType<typeof resolveSyncScope> & {
  connectionScopeKey: string;
};

export interface ReviewDecisionInput {
  rowId: string;
  lotId?: string;
  saleType?: WhatnotMappedSaleType;
  packsCount?: number;
  skip?: boolean;
  selectedImportAction?: WhatnotReviewImportAction;
  targetKind?: WhatnotImportDecisionKind;
  targetSaleId?: string;
}

export interface LotSnapshot {
  id: string;
  name: string;
  lotType: "bulk" | "singles";
  packsPerBox: number;
}

export interface CreateWhatnotImportBatchFromRowsInput {
  workspaceId?: string;
  externalAccountId?: string;
  rows: WhatnotNormalizedImportRowInput[];
}

export function normalizeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function getWhatnotConnectionScopeKey(scope: ReturnType<typeof resolveSyncScope>): string {
  return scope.scopeType === "workspace" ? scope.partitionKey : scope.actorUserId;
}

export async function resolveWhatnotScope(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string | undefined,
  requireOwner = false
): Promise<ResolvedWhatnotScope> {
  const syncScope = resolveSyncScope(actorUserId, workspaceId);
  const connectionScopeKey = getWhatnotConnectionScopeKey(syncScope);

  if (syncScope.scopeType === "workspace") {
    const hasActiveWorkspaceAccess = await hasWorkspaceMembership(config, actorUserId, syncScope.scopeId);
    if (!hasActiveWorkspaceAccess) {
      throw new HttpError(403, "User is not a member of this workspace.");
    }
    if (!requireOwner) {
      return {
        ...syncScope,
        connectionScopeKey
      };
    }

    const membership = await getWorkspaceMembership(config, actorUserId, syncScope.scopeId);
    if (!membership || membership.status === "disabled" || membership.status === "removed") {
      throw new HttpError(403, "User is not a member of this workspace.");
    }
    if (requireOwner && membership.role !== "owner") {
      throw new HttpError(403, "Only workspace owner can manage Whatnot integration.");
    }
  }

  return {
    ...syncScope,
    connectionScopeKey
  };
}

export function buildLotSnapshots(lots: unknown[]): LotSnapshot[] {
  return lots.flatMap((lot): LotSnapshot[] => {
    if (!lot || typeof lot !== "object" || Array.isArray(lot)) {
      return [];
    }
    const lotRecord = lot as Record<string, unknown>;
    const id = normalizeId(lotRecord.id);
    const name = normalizeId(lotRecord.name);
    if (!id || !name) return [];
    return [{
      id,
      name,
      lotType: lotRecord.lotType === "singles" ? "singles" : "bulk",
      packsPerBox: Math.max(1, Math.floor(Number(lotRecord.packsPerBox) || 1))
    }];
  });
}

export function buildSyncWindowStart(connection: WhatnotConnectionDocument | null): string {
  const baseline = connection?.lastSyncedAt
    ? Math.max(0, Date.parse(connection.lastSyncedAt) - INCREMENTAL_SYNC_OVERLAP_MS)
    : Date.now() - (INITIAL_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return new Date(baseline).toISOString();
}

export function createOAuthStateToken(): string {
  return randomBytes(24).toString("hex");
}

export async function ensureFreshWhatnotConnection(
  config: ApiConfig,
  connection: WhatnotConnectionDocument
): Promise<WhatnotConnectionDocument> {
  const expiresAtMs = Date.parse(connection.tokenExpiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + 60_000) {
    return connection;
  }

  const refreshed = await refreshWhatnotAccessToken(config, connection.refreshTokenCiphertext);
  return upsertWhatnotConnection(config, {
    ...connection,
    accessTokenCiphertext: refreshed.accessToken,
    refreshTokenCiphertext: refreshed.refreshToken,
    tokenExpiresAt: refreshed.tokenExpiresAt,
    scopes: refreshed.scopes.length > 0 ? refreshed.scopes : connection.scopes,
    updatedAt: new Date().toISOString(),
    status: "active"
  });
}

export function parseWhatnotConfigured(config: ApiConfig): boolean {
  return [
    config.whatnotClientId,
    config.whatnotClientSecret,
    config.whatnotRedirectUri,
    config.whatnotTokenEncryptionSecret
  ].every((value) => String(value ?? "").trim().length > 0);
}

export function normalizeValidatedAppReturnUrl(config: ApiConfig, rawUrl: string | undefined): string | undefined {
  const candidate = String(rawUrl ?? "").trim();
  if (!candidate) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new HttpError(400, "Whatnot app return URL is invalid.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpError(400, "Whatnot app return URL must use http or https.");
  }

  const allowedOrigins = new Set(
    [
      ...config.allowedOrigins,
      (() => {
        try {
          return new URL(String(config.whatnotRedirectUri ?? "").trim()).origin;
        } catch {
          return "";
        }
      })()
    ]
      .map((origin) => String(origin ?? "").trim())
      .filter((origin) => origin.length > 0)
  );

  if (!allowedOrigins.has(parsed.origin)) {
    throw new HttpError(400, "Whatnot app return URL is not allowed.");
  }

  return parsed.toString();
}

export async function createOrConsumeValidOAuthState(
  config: ApiConfig,
  state: string
) {
  const oauthState = await consumeWhatnotOAuthState(config, state);
  if (!oauthState) {
    throw new HttpError(400, "Whatnot OAuth state is invalid or has expired.");
  }
  const expiresAtMs = Date.parse(oauthState.expiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    throw new HttpError(400, "Whatnot OAuth state has expired.");
  }
  return oauthState;
}

export function parseLotIdNumber(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function normalizeExternalAccountId(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  return value || undefined;
}

export function resolveBatchExternalAccountId(
  fallbackExternalAccountId: string | undefined,
  rows: WhatnotNormalizedImportRowInput[],
  scopePartitionKey: string
): string {
  const resolved = new Set<string>();
  const fallback = normalizeExternalAccountId(fallbackExternalAccountId);
  if (fallback) {
    resolved.add(fallback);
  }
  for (const row of rows) {
    const externalAccountId = normalizeExternalAccountId(row.externalAccountId);
    if (externalAccountId) {
      resolved.add(externalAccountId);
    }
  }

  if (resolved.size === 0) {
    return `scope:${scopePartitionKey}`;
  }

  if (resolved.size !== 1) {
    throw new HttpError(400, "Whatnot CSV import rows must resolve to a single seller account.");
  }

  return [...resolved][0]!;
}
