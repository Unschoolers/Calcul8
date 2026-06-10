import { HttpError } from "../../lib/auth";
import { getSaleDocument, listSalesForLot } from "../../lib/cosmos/salesRepository";
import type {
    ApiConfig,
    WhatnotImportRowDocument
} from "../../types";
import { normalizeId, type LotSnapshot, type ReviewDecisionInput } from "./serviceCore";

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function normalizeOptionalString(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  return value || undefined;
}

type ExternalTransactionRef = {
  provider: "whatnot" | string;
  accountId?: string;
  ledgerTransactionId: string;
  orderId: string;
  orderItemId: string;
};

function normalizeExternalTransactionRef(raw: unknown): ExternalTransactionRef | null {
  if (!isRecord(raw)) {
    return null;
  }

  const provider = normalizeOptionalString(raw.provider);
  const ledgerTransactionId = normalizeOptionalString(raw.ledgerTransactionId);
  const orderId = normalizeOptionalString(raw.orderId);
  const orderItemId = normalizeOptionalString(raw.orderItemId);
  if (!provider || !ledgerTransactionId || !orderId || !orderItemId) {
    return null;
  }

  const ref: ExternalTransactionRef = {
    provider,
    ledgerTransactionId,
    orderId,
    orderItemId
  };
  const accountId = normalizeOptionalString(raw.accountId);
  if (accountId) {
    ref.accountId = accountId;
  }
  return ref;
}

function buildExternalTransactionRef(row: WhatnotImportRowDocument): ExternalTransactionRef | null {
  const orderId = normalizeOptionalString(row.externalOrderId);
  const orderItemId = normalizeOptionalString(row.externalOrderItemId);
  const ledgerTransactionId = normalizeOptionalString(row.externalSaleId)
    ?? (orderId && orderItemId ? `${orderId}:${orderItemId}` : undefined);
  if (!ledgerTransactionId || !orderId || !orderItemId) {
    return null;
  }

  const ref: ExternalTransactionRef = {
    provider: "whatnot",
    ledgerTransactionId,
    orderId,
    orderItemId
  };
  const accountId = normalizeOptionalString(row.externalAccountId);
  if (accountId) {
    ref.accountId = accountId;
  }
  return ref;
}

function mergeExternalTransactionRefs(...groups: Array<unknown[] | undefined>): ExternalTransactionRef[] {
  const refs: ExternalTransactionRef[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const rawRef of group) {
      const ref = normalizeExternalTransactionRef(rawRef);
      if (!ref) continue;
      const key = `${ref.provider}::${ref.ledgerTransactionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
}

function getImportedTransactionRefs(row: WhatnotImportRowDocument): ExternalTransactionRef[] {
  const directRef = buildExternalTransactionRef(row);
  return mergeExternalTransactionRefs(
    Array.isArray(row.externalTransactionRefs) ? row.externalTransactionRefs : undefined,
    directRef ? [directRef] : undefined
  );
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
  const transactionRefs = getImportedTransactionRefs(row);

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
    externalProvider: "whatnot",
    externalAccountId: normalizeOptionalString(row.externalAccountId),
    externalSaleId: normalizeOptionalString(row.externalSaleId),
    externalOrderId: normalizeOptionalString(row.externalOrderId),
    externalOrderItemId: normalizeOptionalString(row.externalOrderItemId),
    memo: normalizeOptionalString(row.title)
  };
  if (transactionRefs.length > 0) {
    salePayload.externalTransactionRefs = transactionRefs;
  }

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
  const transactionRefs = mergeExternalTransactionRefs(
    Array.isArray(existingSaleRecord.externalTransactionRefs) ? existingSaleRecord.externalTransactionRefs : undefined,
    Array.isArray(importedPayload.externalTransactionRefs) ? importedPayload.externalTransactionRefs : undefined
  );

  const mergedPayload: Record<string, unknown> = {
    ...existingSaleRecord,
    date: importedPayload.date,
    price: importedPayload.price,
    quantity: importedPayload.quantity,
    packsCount: importedPayload.packsCount,
    buyerShipping: importedPayload.buyerShipping,
    customer,
    memo: existingMemo || importedMemo || undefined
  };
  if (transactionRefs.length > 0) {
    mergedPayload.externalTransactionRefs = transactionRefs;
  }

  return mergedPayload;
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
