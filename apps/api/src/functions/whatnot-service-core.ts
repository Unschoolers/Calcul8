import { randomBytes } from "node:crypto";
import { HttpError } from "../lib/auth";
import { getSaleDocument, listSalesForLot } from "../lib/cosmos/salesRepository";
import {
  consumeWhatnotOAuthState,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  getWhatnotTargetMappingByMatchKeyHash,
  upsertWhatnotConnection
} from "../lib/cosmos/whatnotRepository";
import { getWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
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
  WhatnotManualDuplicateCandidate,
  WhatnotManualDuplicateSaleSummary,
  WhatnotMappedSaleType,
  WhatnotImportDecisionKind,
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

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    requiresManualReview: target.saleType === "rtyh",
    targetKind: row.targetKind ?? "new"
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
      targetKind: "whatnot_mapping",
      targetSaleId: existingMapping.saleId,
      requiresManualReview: false
    };
  }

  return {
    ...row,
    action: "update",
    existingSaleId: existingMapping.saleId,
    suggestedLotId: Number(existingMapping.lotId),
    matchSource: "remembered",
    targetKind: "whatnot_mapping",
    targetSaleId: existingMapping.saleId,
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

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function normalizeDateStamp(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  return formatLocalDate(parsed);
}

function normalizePersonName(raw: unknown): string {
  return normalizeTitle(raw).replace(/\s+/g, " ");
}

function normalizeOptionalString(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  return value || undefined;
}

function moneyClose(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

function getSaleRecordValue(sale: Record<string, unknown>, key: string): unknown {
  return sale[key];
}

function getSaleQuantity(sale: Record<string, unknown>): number {
  const quantity = Math.max(1, Math.floor(Number(getSaleRecordValue(sale, "quantity")) || 1));
  return quantity;
}

function getSalePacksCount(sale: Record<string, unknown>, quantity: number): number {
  const raw = Number(getSaleRecordValue(sale, "packsCount"));
  return Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.floor(raw)) : quantity;
}

function getSalePrice(sale: Record<string, unknown>): number {
  const price = Number(getSaleRecordValue(sale, "price"));
  return Number.isFinite(price) && price >= 0 ? price : 0;
}

function getSaleEffectiveTotal(sale: Record<string, unknown>): number {
  const quantity = getSaleQuantity(sale);
  const price = getSalePrice(sale);
  const priceIsTotal = getSaleRecordValue(sale, "priceIsTotal") === true;
  return priceIsTotal ? price : price * quantity;
}

function getSaleCustomer(sale: Record<string, unknown>): string {
  const customer = normalizeId(getSaleRecordValue(sale, "customer"));
  if (customer) return customer;
  return normalizeId(getSaleRecordValue(sale, "memo"));
}

function getSaleMemo(sale: Record<string, unknown>): string {
  return normalizeId(getSaleRecordValue(sale, "memo"));
}

function buildSaleSummary(sale: Record<string, unknown>): WhatnotManualDuplicateSaleSummary {
  const quantity = getSaleQuantity(sale);
  const packsCount = getSalePacksCount(sale, quantity);
  return {
    date: normalizeDateStamp(getSaleRecordValue(sale, "date")),
    price: getSalePrice(sale),
    quantity,
    packsCount,
    customer: normalizeId(getSaleRecordValue(sale, "customer")) || undefined,
    memo: getSaleMemo(sale) || undefined
  };
}

export function buildWhatnotManualDuplicateCandidate(
  row: Pick<
    WhatnotImportRowDocument,
    "externalAccountId" | "buyerName" | "quantity" | "price" | "date" | "orderPlacedAt" | "originalItemPrice" | "title" | "listingTitle"
  >,
  lot: LotSnapshot,
  sales: Awaited<ReturnType<typeof listSalesForLot>>
): WhatnotManualDuplicateCandidate | null {
  const normalizedRowDate = normalizeDateStamp(row.orderPlacedAt ?? row.date);
  if (!normalizedRowDate) return null;

  const rowQuantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
  const rowTotalPrice = Number(row.price);
  if (!Number.isFinite(rowTotalPrice) || rowTotalPrice < 0) return null;
  const normalizedBuyerName = normalizePersonName(row.buyerName);

  let bestCandidate: {
    candidate: WhatnotManualDuplicateCandidate;
    score: number;
  } | null = null;

  for (const saleDocument of sales) {
    const sale = isRecord(saleDocument.sale) ? saleDocument.sale : null;
    if (!sale) continue;

    const saleLotId = normalizeId(saleDocument.lotId);
    if (saleLotId !== normalizeId(lot.id)) {
      continue;
    }

    const saleDate = normalizeDateStamp(getSaleRecordValue(sale, "date"));
    if (!saleDate || saleDate !== normalizedRowDate) {
      continue;
    }

    const saleQuantity = getSaleQuantity(sale);
    if (saleQuantity !== rowQuantity) {
      continue;
    }

    const saleTotalPrice = getSaleEffectiveTotal(sale);
    if (!moneyClose(saleTotalPrice, rowTotalPrice)) {
      continue;
    }

    const saleExternalAccountId = normalizeId(getSaleRecordValue(sale, "externalAccountId"));
    if (row.externalAccountId && saleExternalAccountId && saleExternalAccountId !== normalizeId(row.externalAccountId)) {
      continue;
    }

    const saleType = normalizeId(getSaleRecordValue(sale, "type")).toLowerCase();
    const salePacksCount = getSalePacksCount(sale, saleQuantity);
    if (lot.lotType === "singles") {
      if (saleType && saleType !== "pack") continue;
    } else if (saleType === "box" && salePacksCount <= saleQuantity) {
      continue;
    }

    let score = 60;
    const reasons = ["Exact date, amount, and quantity match"];

    if (row.originalItemPrice != null) {
      const rowOriginalItemPrice = Number(row.originalItemPrice);
      const saleUnitPrice = saleQuantity > 0 ? saleTotalPrice / saleQuantity : saleTotalPrice;
      if (Number.isFinite(rowOriginalItemPrice) && moneyClose(rowOriginalItemPrice, saleUnitPrice)) {
        score += 5;
        reasons.push("unit price aligns");
      }
    }

    if (row.externalAccountId && saleExternalAccountId && saleExternalAccountId === normalizeId(row.externalAccountId)) {
      score += 10;
      reasons.push("seller matches");
    }

    const saleCustomer = normalizePersonName(getSaleCustomer(sale));
    const saleMemo = normalizePersonName(getSaleMemo(sale));
    if (normalizedBuyerName && saleCustomer && saleCustomer === normalizedBuyerName) {
      score += 25;
      reasons.push("customer matches buyer name");
    } else if (normalizedBuyerName && saleMemo && saleMemo.includes(normalizedBuyerName)) {
      score += 15;
      reasons.push("memo matches buyer name");
    } else if (normalizedBuyerName) {
      reasons.push("buyer name available");
    }

    const confidence: WhatnotManualDuplicateCandidate["confidence"] = score >= 80 ? "high" : "medium";
    const candidate: WhatnotManualDuplicateCandidate = {
      saleId: normalizeId(saleDocument.saleId),
      confidence,
      reasonSummary: reasons.join("; "),
      saleSummary: buildSaleSummary(sale)
    };

    if (!bestCandidate || score > bestCandidate.score || (score === bestCandidate.score && confidence === "high" && bestCandidate.candidate.confidence !== "high")) {
      bestCandidate = {
        candidate,
        score
      };
    }
  }

  return bestCandidate?.candidate ?? null;
}

export async function buildWhatnotManualDuplicateCandidateForRow(
  config: ApiConfig,
  scopeKey: string,
  row: WhatnotImportRowDocument,
  lot: LotSnapshot
): Promise<WhatnotImportRowDocument> {
  const sales = await listSalesForLot(config, scopeKey, lot.id);
  const manualDuplicateCandidate = buildWhatnotManualDuplicateCandidate(row, lot, sales);
  if (!manualDuplicateCandidate) {
    return row;
  }

  return {
    ...row,
    manualDuplicateCandidate,
    targetKind: row.targetKind ?? "manual_candidate",
    targetSaleId: row.targetSaleId ?? manualDuplicateCandidate.saleId
  };
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
    customer: normalizeOptionalString(row.buyerName),
    externalAccountId: normalizeOptionalString(row.externalAccountId),
    externalSaleId: normalizeOptionalString(row.externalSaleId),
    externalOrderId: normalizeOptionalString(row.externalOrderId),
    externalOrderItemId: normalizeOptionalString(row.externalOrderItemId),
    memo: memoParts.join(" • ")
  };

  return salePayload;
}

export async function buildMergedManualSalePayload(
  config: ApiConfig,
  scopeKey: string,
  row: WhatnotImportRowDocument,
  decision: ReviewDecisionInput,
  lot: LotSnapshot,
  saleId: number
): Promise<Record<string, unknown>> {
  const existingSale = await getSaleDocument(config, scopeKey, lot.id, String(saleId));
  if (!existingSale || !isRecord(existingSale.sale)) {
    throw new HttpError(404, `Target sale ${saleId} was not found.`);
  }

  const importedPayload = buildImportedSalePayload(row, decision, lot, saleId);
  const existingSaleRecord = existingSale.sale;
  const existingMemo = normalizeOptionalString(existingSaleRecord.memo);
  const importedMemo = normalizeOptionalString(importedPayload.memo);
  const customer = normalizeOptionalString(row.buyerName)
    || normalizeOptionalString(existingSaleRecord.customer);

  return {
    ...existingSaleRecord,
    date: importedPayload.date,
    price: importedPayload.price,
    quantity: importedPayload.quantity,
    packsCount: importedPayload.packsCount,
    buyerShipping: importedPayload.buyerShipping,
    customer,
    memo: existingMemo || importedMemo || undefined
  };
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
