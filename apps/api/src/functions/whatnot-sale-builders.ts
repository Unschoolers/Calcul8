import { HttpError } from "../lib/auth";
import { getSaleDocument, listSalesForLot } from "../lib/cosmos/salesRepository";
import type {
    ApiConfig,
    WhatnotImportRowDocument
} from "../types";
import { normalizeId, type LotSnapshot, type ReviewDecisionInput } from "./whatnot-service-core";

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function normalizeOptionalString(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  return value || undefined;
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
