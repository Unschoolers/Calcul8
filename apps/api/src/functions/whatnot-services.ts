import { randomBytes } from "node:crypto";
import { HttpError } from "../lib/auth";
import {
  createPendingWhatnotImportBatch,
  createWhatnotOAuthState,
  consumeWhatnotOAuthState,
  deleteWhatnotConnection,
  getLatestPendingWhatnotImportBatch,
  getWhatnotConnection,
  getWhatnotImportBatch,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  getWhatnotTargetMappingByMatchKeyHash,
  upsertWhatnotConnection,
  upsertWhatnotImportBatch,
  upsertWhatnotSaleImportMapping,
  upsertWhatnotTargetMapping
} from "../lib/cosmos/whatnotRepository";
import { getWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { listSalesForLot, upsertSaleDocument } from "../lib/cosmos/salesRepository";
import { getEffectiveSyncSnapshot } from "../lib/cosmos/syncSnapshotRepository";
import {
  buildWhatnotImportRowFromNormalizedInput,
  buildWhatnotAuthorizeUrl,
  buildWhatnotRememberedMatchKeys,
  exchangeWhatnotAuthorizationCode,
  fetchWhatnotOrdersPage,
  fetchWhatnotSellerIdentity,
  hashWhatnotExternalSaleKey,
  hashWhatnotMatchKey,
  isWhatnotRowLikelyRtyh,
  refreshWhatnotAccessToken,
  resolveWhatnotAppCallbackUrl
} from "../lib/whatnot";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { resolveSyncScope } from "../lib/syncScopeResolution";
import type {
  ApiConfig,
  WhatnotConnectionDocument,
  WhatnotImportBatchDocument,
  WhatnotImportRowDocument,
  WhatnotMappedSaleType,
  WhatnotNormalizedImportRowInput
} from "../types";

const WHATNOT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const INITIAL_SYNC_WINDOW_DAYS = 90;
const INCREMENTAL_SYNC_OVERLAP_MS = 24 * 60 * 60 * 1000;
const MAX_SYNC_ROWS = 250;

type ResolvedWhatnotScope = ReturnType<typeof resolveSyncScope> & {
  connectionScopeKey: string;
};

interface ReviewDecisionInput {
  rowId: string;
  lotId?: string;
  saleType?: WhatnotMappedSaleType;
  packsCount?: number;
  skip?: boolean;
}

interface LotSnapshot {
  id: string;
  name: string;
  lotType: "bulk" | "singles";
  packsPerBox: number;
}

interface CreateWhatnotImportBatchFromRowsInput {
  workspaceId?: string;
  externalAccountId?: string;
  rows: WhatnotNormalizedImportRowInput[];
}

function normalizeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeTitle(raw: unknown): string {
  return normalizeId(raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getWhatnotConnectionScopeKey(scope: ReturnType<typeof resolveSyncScope>): string {
  return scope.scopeType === "workspace" ? scope.partitionKey : scope.actorUserId;
}

async function resolveWhatnotScope(
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

function buildLotSnapshots(lots: unknown[]): LotSnapshot[] {
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

function buildSyncWindowStart(connection: WhatnotConnectionDocument | null): string {
  const baseline = connection?.lastSyncedAt
    ? Math.max(0, Date.parse(connection.lastSyncedAt) - INCREMENTAL_SYNC_OVERLAP_MS)
    : Date.now() - (INITIAL_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return new Date(baseline).toISOString();
}

function createOAuthStateToken(): string {
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

async function resolveSuggestedTarget(
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

function decorateDuplicateState(
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

async function ensureFreshWhatnotConnection(
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

function parseWhatnotConfigured(config: ApiConfig): boolean {
  return [
    config.whatnotClientId,
    config.whatnotClientSecret,
    config.whatnotRedirectUri,
    config.whatnotTokenEncryptionSecret
  ].every((value) => String(value ?? "").trim().length > 0);
}

function normalizeValidatedAppReturnUrl(config: ApiConfig, rawUrl: string | undefined): string | undefined {
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

async function createOrConsumeValidOAuthState(
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

export async function syncWhatnotOrdersForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
): Promise<WhatnotImportBatchDocument> {
  const scope = await resolveWhatnotScope(config, actorUserId, workspaceId, Boolean(workspaceId));
  const existingConnection = await getWhatnotConnection(config, scope.connectionScopeKey);
  if (!existingConnection || existingConnection.status !== "active") {
    throw new HttpError(404, "Connect Whatnot first.");
  }

  const connection = await ensureFreshWhatnotConnection(config, existingConnection);
  const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
  const lots = buildLotSnapshots(snapshot?.lots ?? []);
  const createdAtGte = buildSyncWindowStart(connection);
  const rows: WhatnotImportRowDocument[] = [];
  let after: string | null = null;

  while (rows.length < MAX_SYNC_ROWS) {
    const page = await fetchWhatnotOrdersPage(config, connection.accessTokenCiphertext, connection.externalAccountId, {
      createdAtGte,
      after
    });

    for (const rawRow of page.rows) {
      const externalSaleKeyHash = hashWhatnotExternalSaleKey(
        rawRow.externalAccountId,
        rawRow.externalOrderId,
        rawRow.externalOrderItemId
      );
      const existingMapping = await getWhatnotSaleImportMappingByExternalSaleKeyHash(
        config,
        scope.partitionKey,
        externalSaleKeyHash
      );
      let row = decorateDuplicateState(rawRow, existingMapping);
      row = await resolveSuggestedTarget(config, scope.partitionKey, lots, row);
      rows.push(row);
      if (rows.length >= MAX_SYNC_ROWS) break;
    }

    if (!page.nextCursor || page.rows.length === 0 || rows.length >= MAX_SYNC_ROWS) {
      break;
    }
    after = page.nextCursor;
  }

  const now = new Date().toISOString();
  const batch = await createPendingWhatnotImportBatch(config, {
    docType: "whatnot_import_batch",
    userId: scope.partitionKey,
    scopeKey: scope.partitionKey,
    origin: "oauth_sync",
    provider: "whatnot",
    externalAccountId: connection.externalAccountId,
    startedByUserId: actorUserId,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    importWindowStartedAt: createdAtGte,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows
  });

  await upsertWhatnotConnection(config, {
    ...connection,
    lastSyncedAt: now,
    syncCursor: after,
    syncWindowStartedAt: createdAtGte,
    updatedAt: now
  });

  return batch;
}

function parseLotIdNumber(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function buildImportedSalePayload(
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

function resolveBatchExternalAccountId(
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

function buildMutationId(batchId: string, row: WhatnotImportRowDocument): string {
  return `whatnot_import:${batchId}:${row.externalOrderId}:${row.externalOrderItemId}`;
}

async function allocateImportedSaleId(
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

export async function createWhatnotImportBatchFromRowsForActor(
  config: ApiConfig,
  actorUserId: string,
  input: CreateWhatnotImportBatchFromRowsInput
): Promise<WhatnotImportBatchDocument> {
  const scope = await resolveWhatnotScope(config, actorUserId, input.workspaceId, false);
  const rowsInput = Array.isArray(input.rows) ? input.rows : [];
  if (rowsInput.length === 0) {
    throw new HttpError(400, "Whatnot import requires at least one row.");
  }

  const externalAccountId = resolveBatchExternalAccountId(input.externalAccountId, rowsInput, scope.partitionKey);
  const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
  const lots = buildLotSnapshots(snapshot?.lots ?? []);
  const seenExternalHashes = new Set<string>();
  const rows: WhatnotImportRowDocument[] = [];

  for (const rawRow of rowsInput.slice(0, MAX_SYNC_ROWS)) {
    const normalizedRow = buildWhatnotImportRowFromNormalizedInput({
      ...rawRow,
      externalAccountId
    });
    const externalSaleKeyHash = hashWhatnotExternalSaleKey(
      normalizedRow.externalAccountId,
      normalizedRow.externalOrderId,
      normalizedRow.externalOrderItemId
    );
    if (seenExternalHashes.has(externalSaleKeyHash)) {
      throw new HttpError(400, `Duplicate Whatnot import row for ${normalizedRow.externalSaleId}.`);
    }
    seenExternalHashes.add(externalSaleKeyHash);

    const existingMapping = await getWhatnotSaleImportMappingByExternalSaleKeyHash(
      config,
      scope.partitionKey,
      externalSaleKeyHash
    );
    let row = decorateDuplicateState(normalizedRow, existingMapping);
    row = await resolveSuggestedTarget(config, scope.partitionKey, lots, row);
    rows.push(row);
  }

  const now = new Date().toISOString();
  return createPendingWhatnotImportBatch(config, {
    docType: "whatnot_import_batch",
    userId: scope.partitionKey,
    scopeKey: scope.partitionKey,
    origin: "csv_manual",
    provider: "whatnot",
    externalAccountId,
    startedByUserId: actorUserId,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    importWindowStartedAt: now,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows
  });
}

export async function confirmWhatnotImportBatchForActor(
  config: ApiConfig,
  actorUserId: string,
  input: {
    batchId: string;
    workspaceId?: string;
    decisions: ReviewDecisionInput[];
  }
): Promise<{ importedCount: number; updatedCount: number; skippedCount: number }> {
  const scope = await resolveWhatnotScope(config, actorUserId, input.workspaceId, false);
  const connection = await getWhatnotConnection(config, scope.connectionScopeKey);

  const batch = await getWhatnotImportBatch(config, scope.partitionKey, input.batchId);
  if (!batch || batch.status !== "pending_review") {
    throw new HttpError(404, "Whatnot review batch was not found.");
  }

  const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
  const lots = buildLotSnapshots(snapshot?.lots ?? []);
  const decisionsByRowId = new Map(
    input.decisions.map((decision) => [normalizeId(decision.rowId), decision] as const)
  );

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const nextSaleIdByLotId = new Map<string, number>();

  for (const row of batch.rows) {
    const decision = decisionsByRowId.get(row.rowId);
    if (!decision || decision.skip) {
      skippedCount += 1;
      continue;
    }

    const targetLotId = parseLotIdNumber(decision.lotId ?? row.suggestedLotId);
    if (!targetLotId) {
      throw new HttpError(400, `Lot is required for row ${row.rowId}.`);
    }

    const lot = lots.find((candidate) => Number(candidate.id) === targetLotId);
    if (!lot) {
      throw new HttpError(400, `Lot ${targetLotId} was not found in the current scope.`);
    }

    const desiredSaleType = lot.lotType === "singles"
      ? "pack"
      : (decision.saleType ?? row.suggestedSaleType);
    if (!desiredSaleType) {
      throw new HttpError(400, `Sale type is required for row ${row.rowId}.`);
    }
    if (desiredSaleType === "rtyh" && (!Number.isFinite(Number(decision.packsCount)) || Number(decision.packsCount) <= 0)) {
      throw new HttpError(400, `RTYH rows require packs sold for row ${row.rowId}.`);
    }

    const externalSaleKeyHash = hashWhatnotExternalSaleKey(
      row.externalAccountId,
      row.externalOrderId,
      row.externalOrderItemId
    );
    const existingMapping = await getWhatnotSaleImportMappingByExternalSaleKeyHash(
      config,
      scope.partitionKey,
      externalSaleKeyHash
    );

    const saleIdNumber = existingMapping
      ? Math.max(1, Math.floor(Number(existingMapping.saleId) || 0))
      : await allocateImportedSaleId(config, scope.partitionKey, lot.id, nextSaleIdByLotId);
    const salePayload = buildImportedSalePayload(row, decision, lot, saleIdNumber);
    await upsertSaleDocument(config, {
      scopeKey: scope.partitionKey,
      lotId: lot.id,
      saleId: String(saleIdNumber),
      sale: salePayload,
      updatedBy: actorUserId,
      mutationId: buildMutationId(batch.batchId, row)
    });

    await upsertWhatnotSaleImportMapping(config, {
      docType: "sale_import_mapping",
      scopeKey: scope.partitionKey,
      externalSaleKeyHash,
      provider: "whatnot",
      externalAccountId: row.externalAccountId,
      externalSaleId: row.externalSaleId,
      externalOrderId: row.externalOrderId,
      externalOrderItemId: row.externalOrderItemId,
      lotId: lot.id,
      saleId: String(saleIdNumber),
      payloadFingerprint: row.payloadFingerprint,
      updatedAt: new Date().toISOString()
    });

    const matchKeys = [...new Set(buildWhatnotRememberedMatchKeys(row))];
    for (const matchKey of matchKeys) {
      await upsertWhatnotTargetMapping(config, {
        scopeKey: scope.partitionKey,
        matchKeyHash: hashWhatnotMatchKey(matchKey),
        docType: "whatnot_target_mapping",
        provider: "whatnot",
        externalAccountId: row.externalAccountId,
        matchKey,
        lotId: lot.id,
        saleType: desiredSaleType,
        updatedAt: new Date().toISOString(),
        confirmedByUserId: actorUserId
      });
    }

    if (existingMapping) {
      updatedCount += 1;
    } else {
      importedCount += 1;
    }
  }

  await upsertWhatnotImportBatch(config, {
    ...batch,
    status: "completed",
    importedCount,
    updatedCount,
    skippedCount,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  if (batch.origin === "oauth_sync" && connection && connection.status === "active") {
    await upsertWhatnotConnection(config, {
      ...connection,
      updatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString()
    });
  }

  return {
    importedCount,
    updatedCount,
    skippedCount
  };
}
