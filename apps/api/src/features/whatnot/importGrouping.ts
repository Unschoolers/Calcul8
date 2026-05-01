import { listSalesForLot } from "../../lib/cosmos/salesRepository";
import type {
    ApiConfig,
    SaleDocument,
    WhatnotImportRowDocument
} from "../../types";
import { buildWhatnotManualDuplicateCandidate } from "./duplicateDetection";
import { normalizeId, parseLotIdNumber, type LotSnapshot } from "./serviceCore";

function normalizeGroupingValue(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeGroupingDate(raw: unknown): string {
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

function buildManualCandidateGroupKey(
  row: Pick<WhatnotImportRowDocument, "buyerName" | "listingTitle" | "title" | "orderPlacedAt" | "date" | "externalAccountId">,
  lotId: string
): string | null {
  const buyerName = normalizeGroupingValue(row.buyerName);
  const listingTitle = normalizeGroupingValue(row.listingTitle ?? row.title);
  const orderDate = normalizeGroupingDate(row.orderPlacedAt ?? row.date);
  const normalizedLotId = normalizeId(lotId);
  if (!buyerName || !listingTitle || !orderDate || !normalizedLotId) {
    return null;
  }
  return [
    normalizeGroupingValue(row.externalAccountId),
    normalizedLotId,
    orderDate,
    buyerName,
    listingTitle
  ].join("::");
}

export function buildManualConfirmGroupKey(
  row: Pick<WhatnotImportRowDocument, "listingTitle" | "title" | "orderPlacedAt" | "date" | "externalAccountId">,
  lotId: string,
  targetSaleId: string
): string | null {
  const listingTitle = normalizeGroupingValue(row.listingTitle ?? row.title);
  const orderDate = normalizeGroupingDate(row.orderPlacedAt ?? row.date);
  const normalizedLotId = normalizeId(lotId);
  const normalizedTargetSaleId = normalizeId(targetSaleId);
  if (!listingTitle || !orderDate || !normalizedLotId || !normalizedTargetSaleId) {
    return null;
  }
  return [
    normalizedTargetSaleId,
    normalizeGroupingValue(row.externalAccountId),
    normalizedLotId,
    orderDate,
    listingTitle
  ].join("::");
}

export function buildGroupedImportRow(rows: WhatnotImportRowDocument[]): WhatnotImportRowDocument {
  const firstRow = rows[0]!;
  const resolveFirstNonEmpty = (selector: (row: WhatnotImportRowDocument) => unknown): string | undefined => {
    for (const row of rows) {
      const value = String(selector(row) ?? "").trim();
      if (value) return value;
    }
    return undefined;
  };
  return {
    ...firstRow,
    buyerName: resolveFirstNonEmpty((row) => row.buyerName),
    listingTitle: resolveFirstNonEmpty((row) => row.listingTitle) ?? firstRow.listingTitle,
    title: resolveFirstNonEmpty((row) => row.title) ?? firstRow.title,
    quantity: rows.reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row.quantity) || 1)), 0),
    price: rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0),
    buyerShipping: rows.reduce((sum, row) => sum + (Number(row.buyerShipping) || 0), 0)
  };
}

function applyManualDuplicateCandidate(
  row: WhatnotImportRowDocument,
  manualDuplicateCandidate: NonNullable<WhatnotImportRowDocument["manualDuplicateCandidate"]>
): WhatnotImportRowDocument {
  return {
    ...row,
    manualDuplicateCandidate,
    targetKind: "manual_candidate",
    targetSaleId: manualDuplicateCandidate.saleId
  };
}

export async function attachManualDuplicateCandidates(
  config: ApiConfig,
  scopeKey: string,
  lots: LotSnapshot[],
  rows: WhatnotImportRowDocument[]
): Promise<WhatnotImportRowDocument[]> {
  const salesByLot = new Map<string, Promise<SaleDocument[]>>();
  const getSalesForLot = (lotId: string): Promise<SaleDocument[]> => {
    const normalizedLotId = normalizeId(lotId);
    const cached = salesByLot.get(normalizedLotId);
    if (cached) return cached;
    const request = listSalesForLot(config, scopeKey, normalizedLotId);
    salesByLot.set(normalizedLotId, request);
    return request;
  };

  const individuallyMatchedRows = await Promise.all(rows.map(async (row) => {
    if (row.targetKind === "whatnot_mapping") {
      return row;
    }

    const lotId = parseLotIdNumber(row.suggestedLotId);
    if (!lotId) {
      return row;
    }

    const lot = lots.find((candidate) => Number(candidate.id) === lotId);
    if (!lot) {
      return row;
    }

    const sales = await getSalesForLot(lot.id);
    const manualDuplicateCandidate = buildWhatnotManualDuplicateCandidate(row, lot, sales);
    if (!manualDuplicateCandidate) {
      return row;
    }

    return applyManualDuplicateCandidate(row, manualDuplicateCandidate);
  }));

  const groupedRows = [...individuallyMatchedRows];
  const groupedIndexesByKey = new Map<string, number[]>();
  for (let index = 0; index < groupedRows.length; index += 1) {
    const row = groupedRows[index]!;
    if (row.targetKind === "whatnot_mapping" || row.manualDuplicateCandidate) {
      continue;
    }
    const lotId = parseLotIdNumber(row.suggestedLotId);
    if (!lotId) continue;
    const groupKey = buildManualCandidateGroupKey(row, String(lotId));
    if (!groupKey) continue;
    const groupIndexes = groupedIndexesByKey.get(groupKey) ?? [];
    groupIndexes.push(index);
    groupedIndexesByKey.set(groupKey, groupIndexes);
  }

  for (const indexes of groupedIndexesByKey.values()) {
    if (indexes.length <= 1) continue;
    const firstRow = groupedRows[indexes[0]!]!;
    const lotId = parseLotIdNumber(firstRow.suggestedLotId);
    if (!lotId) continue;
    const lot = lots.find((candidate) => Number(candidate.id) === lotId);
    if (!lot) continue;
    const sales = await getSalesForLot(lot.id);
    const groupedImportRow = buildGroupedImportRow(indexes.map((index) => groupedRows[index]!));
    const manualDuplicateCandidate = buildWhatnotManualDuplicateCandidate(groupedImportRow, lot, sales);
    if (!manualDuplicateCandidate) continue;

    for (const index of indexes) {
      groupedRows[index] = applyManualDuplicateCandidate(groupedRows[index]!, manualDuplicateCandidate);
    }
  }

  return groupedRows;
}
