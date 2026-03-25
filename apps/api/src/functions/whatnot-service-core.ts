import { randomBytes } from "node:crypto";
import { HttpError } from "../lib/auth";
import {
  consumeWhatnotOAuthState,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  getWhatnotTargetMappingByMatchKeyHash,
  upsertWhatnotConnection
} from "../lib/cosmos/whatnotRepository";
import { getWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { listSalesForLot } from "../lib/cosmos/salesRepository";
import {
  buildWhatnotRememberedMatchKeys,
  hashWhatnotMatchKey,
  isWhatnotRowLikelyRtyh,
  refreshWhatnotAccessToken
} from "../lib/whatnot";
import { resolveSyncScope } from "../lib/syncScopeResolution";
import type {
  ApiConfig,
  WhatnotConnectionDocument,
  WhatnotImportRowDocument,
  WhatnotMappedSaleType,
  WhatnotNormalizedImportRowInput
} from "../types";

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

function normalizeTitle(raw: unknown): string {
  return normalizeId(raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function applySuggestedTarget(
  row: WhatnotImportRowDocument,
  target: { lotId: string; saleType: WhatnotMappedSaleType; source: "remembered" | "title" }
): WhatnotImportRowDocument {
  const nextRow: WhatnotImportRowDocument = {
    ...row,
    suggestedLotId: Number(target.lotId),
    suggestedSaleType: target.saleType,
    matchSource: target.source,
    requiresManualReview: target.saleType === "rtyh"
  };
  if (target.saleType === "rtyh") {
    nextRow.suggestedPacksCount = undefined;
  }
  return nextRow;
}

export async function resolveSuggestedTarget(
  config: ApiConfig,
  scopeKey: string,
  lots: LotSnapshot[],
  row: WhatnotImportRowDocument
): Promise<WhatnotImportRowDocument> {
  for (const key of buildWhatnotRememberedMatchKeys(row)) {
    const mapping = await getWhatnotTargetMappingByMatchKeyHash(config, scopeKey, hashWhatnotMatchKey(key));
    if (mapping) {
      return applySuggestedTarget(row, {
        lotId: mapping.lotId,
        saleType: mapping.saleType,
        source: "remembered"
      });
    }
  }

  const normalizedTitle = normalizeTitle(row.title);
  if (!normalizedTitle) return row;

  const exactLot = lots.find((lot) => normalizeTitle(lot.name) === normalizedTitle);
  if (!exactLot) return row;

  const saleType: WhatnotMappedSaleType = exactLot.lotType === "singles"
    ? "pack"
    : (isWhatnotRowLikelyRtyh(row) ? "rtyh" : "pack");

  return applySuggestedTarget(row, {
    lotId: exactLot.id,
    saleType,
    source: "title"
  });
}

export function decorateDuplicateState(
  row: WhatnotImportRowDocument,
  existingMapping: Awaited<ReturnType<typeof getWhatnotSaleImportMappingByExternalSaleKeyHash>>
): WhatnotImportRowDocument {
  if (!existingMapping) {
    return row;
  }

  if (existingMapping.payloadFingerprint === row.payloadFingerprint) {
    return {
      ...row,
      action: "skip",
      existingSaleId: existingMapping.saleId,
      requiresManualReview: false
    };
  }

  return {
    ...row,
    action: "update",
    existingSaleId: existingMapping.saleId,
    suggestedLotId: Number(existingMapping.lotId),
    matchSource: "remembered",
    requiresManualReview: false
  };
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

export function buildImportedSalePayload(
  row: WhatnotImportRowDocument,
  decision: ReviewDecisionInput,
  lot: LotSnapshot,
  saleId: number
): Record<string, unknown> {
  const normalizedSaleType = lot.lotType === "singles"
    ? "pack"
    : (decision.saleType ?? row.suggestedSaleType ?? "pack");
  const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
  const totalPrice = Number(row.price) || 0;
  const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;
  const memoParts = [
    `Whatnot ${row.externalOrderId}`,
    row.title
  ]
    .map((part) => normalizeId(part))
    .filter((part) => part.length > 0);

  const salePayload: Record<string, unknown> = {
    id: saleId,
    type: normalizedSaleType,
    quantity,
    packsCount: normalizedSaleType === "box"
      ? quantity * Math.max(1, lot.packsPerBox)
      : normalizedSaleType === "rtyh"
        ? Math.max(1, Math.floor(Number(decision.packsCount) || 0))
        : quantity,
    price: lot.lotType === "singles" ? totalPrice : unitPrice,
    priceIsTotal: lot.lotType === "singles" ? true : undefined,
    buyerShipping: Number(row.buyerShipping) || 0,
    date: row.date,
    memo: memoParts.join(" • ")
  };

  return salePayload;
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

export function buildMutationId(batchId: string, row: WhatnotImportRowDocument): string {
  return `whatnot_import:${batchId}:${row.externalOrderId}:${row.externalOrderItemId}`;
}

export async function allocateImportedSaleId(
  config: ApiConfig,
  scopeKey: string,
  lotId: string,
  nextSaleIdByLotId: Map<string, number>
): Promise<number> {
  const cached = nextSaleIdByLotId.get(lotId);
  if (cached != null) {
    nextSaleIdByLotId.set(lotId, cached + 1);
    return cached;
  }

  const sales = await listSalesForLot(config, scopeKey, lotId);
  const maxExistingSaleId = sales.reduce((maxId, sale) => {
    const parsed = Math.floor(Number(sale.saleId));
    return Number.isFinite(parsed) && parsed > maxId ? parsed : maxId;
  }, 0);
  const nextSaleId = maxExistingSaleId + 1;
  nextSaleIdByLotId.set(lotId, nextSaleId + 1);
  return nextSaleId;
}
