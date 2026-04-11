import { listSalesForLot } from "../lib/cosmos/salesRepository";
import {
    getWhatnotSaleImportMappingByExternalSaleKeyHash,
    getWhatnotTargetMappingByMatchKeyHash
} from "../lib/cosmos/whatnotRepository";
import {
    buildWhatnotRememberedMatchKeys,
    hashWhatnotMatchKey,
    isWhatnotRowLikelyRtyh
} from "../lib/whatnot";
import type {
    ApiConfig,
    WhatnotImportRowDocument,
    WhatnotManualDuplicateCandidate,
    WhatnotManualDuplicateSaleSummary,
    WhatnotMappedSaleType
} from "../types";
import { normalizeId, type LotSnapshot } from "./whatnot-service-core";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTitle(raw: unknown): string {
  return normalizeId(raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
