import type {
  WhatnotImportDecisionKind,
  WhatnotImportReviewRow,
  WhatnotManualDuplicateCandidate,
  WhatnotMappedSaleType,
  WhatnotReviewImportAction,
  WhatnotSaleImportAction
} from "../../types/app.ts";

const CSV_TITLE_ALIASES = [
  "listingtitle",
  "title",
  "item",
  "product",
  "name",
  "description",
  "listing",
  "transactionmessage",
  "orderitemtitle",
  "order item",
  "product title"
];

const CSV_LISTING_TITLE_ALIASES = ["listingtitle", "listing name", "listing"];
const CSV_BUYER_NAME_ALIASES = ["buyername", "buyer", "customer", "customername", "username", "buyerusername"];
const CSV_SKU_ALIASES = ["sku", "productsku", "itemsku", "listingsku", "variantsku"];
const CSV_PRODUCT_CATEGORY_ALIASES = ["productcategory", "category", "producttype"];
const CSV_QUANTITY_ALIASES = ["quantitysold", "quantity", "qty", "count", "units", "itemcount"];
const CSV_PRICE_ALIASES = [
  "postcouponprice",
  "itemsubtotal",
  "lineitemtotal",
  "saleprice",
  "subtotal",
  "price",
  "amount",
  "total",
  "gross",
  "revenue",
  "buyerpaid",
  "transactionamount"
];
const CSV_ORIGINAL_ITEM_PRICE_ALIASES = ["originalitemprice", "itemprice", "original price", "item price"];
const CSV_SHIPPING_ALIASES = [
  "buyershipping",
  "buyer shipping",
  "buyershippingpaid",
  "shippingamount",
  "shippingprice",
  "shipping",
  "shippingfee"
];
const CSV_DATE_ALIASES = [
  "transactioncompletedatutc",
  "transactioncompletedat",
  "soldat",
  "createdat",
  "orderdate",
  "date"
];
const CSV_ORDER_PLACED_AT_ALIASES = ["orderplacedatutc", "orderplacedat", "placedat"];
const CSV_STATUS_ALIASES = ["orderstatus", "status", "orderstate", "transactiontype"];
const CSV_EXTERNAL_SALE_ID_ALIASES = ["ledgertransactionid", "salesid", "saleid", "externalsaleid", "transactionid"];
const CSV_EXTERNAL_ORDER_ID_ALIASES = ["orderid", "externalorderid"];
const CSV_EXTERNAL_ORDER_ITEM_ID_ALIASES = ["orderitemid", "externalorderitemid", "lineitemid", "itemid"];
const CSV_EXTERNAL_ACCOUNT_ID_ALIASES = ["accountid", "sellerid", "externalaccountid"];
const CSV_SALE_TYPE_ALIASES = ["saletype", "sale type", "type", "mode"];
const CSV_PACKS_COUNT_ALIASES = ["packscount", "packs", "packssold", "itemsold"];
const WHATNOT_RTYH_TOKENS = ["rtyh", "spot", "roulette", "wheel", "pick"];
const WHATNOT_BOX_TOKENS = [" box", " sealed box", " booster box"];
const WHATNOT_PACK_TOKENS = [" pack", " packs", " single", " singles"];

export interface WhatnotCsvImportDraft {
  headers: string[];
  rows: string[][];
  mapping: WhatnotCsvColumnMapping;
}

export interface WhatnotCsvColumnMapping {
  title: number | null;
  listingTitle: number | null;
  buyerName: number | null;
  orderPlacedAt: number | null;
  originalItemPrice: number | null;
  sku: number | null;
  productCategory: number | null;
  quantity: number | null;
  price: number | null;
  buyerShipping: number | null;
  date: number | null;
  orderStatus: number | null;
  externalSaleId: number | null;
  externalOrderId: number | null;
  externalOrderItemId: number | null;
  externalAccountId: number | null;
  saleType: number | null;
  packsCount: number | null;
}

export interface ParsedWhatnotCsvRowsResult {
  entries: WhatnotImportReviewRow[];
  skippedCount: number;
}

function normalizeCsvToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    const next = raw[index + 1];

    if (current === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && current === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (!inQuotes && (current === "\n" || current === "\r")) {
      if (current === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some((part) => part.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += current;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((part) => part.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function resolveCsvColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((header) => normalizeCsvToken(header));
  for (const alias of aliases) {
    const normalizedAlias = normalizeCsvToken(alias);
    const index = normalizedHeaders.findIndex((header) => header === normalizedAlias);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

function normalizeCsvHeaders(headers: string[], totalColumns: number): string[] {
  return Array.from({ length: totalColumns }, (_, index) => {
    const raw = headers[index] ?? "";
    return raw.trim() || `Column ${index + 1}`;
  });
}

function isValidCsvColumnIndex(index: number | null, headersLength: number): index is number {
  return Number.isInteger(index) && Number(index) >= 0 && Number(index) < headersLength;
}

export function isValidWhatnotCsvColumnIndex(index: number | null, headersLength: number): index is number {
  return isValidCsvColumnIndex(index, headersLength);
}

function parseCurrencyLikeNumber(value: string): number {
  const cleaned = value
    .replace(/[$,]/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function parsePositiveIntegerOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  if (rounded <= 0) return null;
  return rounded;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildUtcDateFromParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function parseUtcTimestamp(value: string): Date | null {
  const isoLikeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?(?:\.\d+)?(?:\s*(Z|UTC))?$/i
  );
  if (isoLikeMatch) {
    return buildUtcDateFromParts(
      Number(isoLikeMatch[1]),
      Number(isoLikeMatch[2]),
      Number(isoLikeMatch[3]),
      Number(isoLikeMatch[4] ?? 0),
      Number(isoLikeMatch[5] ?? 0),
      Number(isoLikeMatch[6] ?? 0)
    );
  }

  const slashMatch = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?(?:\s*(Z|UTC))?$/i
  );
  if (slashMatch) {
    return buildUtcDateFromParts(
      Number(slashMatch[3]),
      Number(slashMatch[1]),
      Number(slashMatch[2]),
      Number(slashMatch[4] ?? 0),
      Number(slashMatch[5] ?? 0),
      Number(slashMatch[6] ?? 0)
    );
  }

  return null;
}

function normalizeDateOnly(value: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const explicitDateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (explicitDateOnly) {
    return trimmed;
  }

  const parsedUtc = parseUtcTimestamp(trimmed);
  if (parsedUtc && !Number.isNaN(parsedUtc.getTime())) {
    return formatLocalDate(parsedUtc);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return formatLocalDate(parsed);
}

function inferWhatnotSaleType(rawType: unknown, title: string): WhatnotMappedSaleType | null {
  const candidate = String(rawType ?? "").trim().toLowerCase();
  if (candidate === "pack" || candidate === "box" || candidate === "rtyh") {
    return candidate;
  }
  if (candidate === "item" || candidate === "single" || candidate === "singles") {
    return "pack";
  }

  const normalizedTitle = normalizeCsvToken(title);
  if (!normalizedTitle) return null;
  if (WHATNOT_RTYH_TOKENS.some((token) => normalizedTitle.includes(token))) {
    return "rtyh";
  }
  const humanTitle = ` ${String(title ?? "").trim().toLowerCase()} `;
  if (WHATNOT_BOX_TOKENS.some((token) => humanTitle.includes(token))) {
    return "box";
  }
  if (WHATNOT_PACK_TOKENS.some((token) => humanTitle.includes(token))) {
    return "pack";
  }
  return null;
}

function buildRowId(row: Record<string, unknown>, index: number): string {
  const candidates = [
    row.rowId,
    row.externalSaleId,
    row.externalOrderItemId,
    row.externalOrderId,
    row.externalAccountId
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value.length > 0) return value;
  }
  return `whatnot-csv:${index + 1}`;
}

function buildValueOrFallback(row: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value.length > 0) return value;
  }
  return fallback;
}

function buildMapping(headers: string[]): WhatnotCsvColumnMapping {
  return {
    title: resolveCsvColumnIndex(headers, CSV_TITLE_ALIASES),
    listingTitle: resolveCsvColumnIndex(headers, CSV_LISTING_TITLE_ALIASES),
    buyerName: resolveCsvColumnIndex(headers, CSV_BUYER_NAME_ALIASES),
    orderPlacedAt: resolveCsvColumnIndex(headers, CSV_ORDER_PLACED_AT_ALIASES),
    originalItemPrice: resolveCsvColumnIndex(headers, CSV_ORIGINAL_ITEM_PRICE_ALIASES),
    sku: resolveCsvColumnIndex(headers, CSV_SKU_ALIASES),
    productCategory: resolveCsvColumnIndex(headers, CSV_PRODUCT_CATEGORY_ALIASES),
    quantity: resolveCsvColumnIndex(headers, CSV_QUANTITY_ALIASES),
    price: resolveCsvColumnIndex(headers, CSV_PRICE_ALIASES),
    buyerShipping: resolveCsvColumnIndex(headers, CSV_SHIPPING_ALIASES),
    date: resolveCsvColumnIndex(headers, CSV_DATE_ALIASES),
    orderStatus: resolveCsvColumnIndex(headers, CSV_STATUS_ALIASES),
    externalSaleId: resolveCsvColumnIndex(headers, CSV_EXTERNAL_SALE_ID_ALIASES),
    externalOrderId: resolveCsvColumnIndex(headers, CSV_EXTERNAL_ORDER_ID_ALIASES),
    externalOrderItemId: resolveCsvColumnIndex(headers, CSV_EXTERNAL_ORDER_ITEM_ID_ALIASES),
    externalAccountId: resolveCsvColumnIndex(headers, CSV_EXTERNAL_ACCOUNT_ID_ALIASES),
    saleType: resolveCsvColumnIndex(headers, CSV_SALE_TYPE_ALIASES),
    packsCount: resolveCsvColumnIndex(headers, CSV_PACKS_COUNT_ALIASES)
  };
}

export function buildWhatnotCsvImportDraft(raw: string): WhatnotCsvImportDraft | null {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const headerMatches = [
    resolveCsvColumnIndex(firstRow, CSV_TITLE_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_LISTING_TITLE_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_BUYER_NAME_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_ORDER_PLACED_AT_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_ORIGINAL_ITEM_PRICE_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_SKU_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_PRODUCT_CATEGORY_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_QUANTITY_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_PRICE_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_SHIPPING_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_DATE_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_STATUS_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_EXTERNAL_SALE_ID_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_EXTERNAL_ORDER_ID_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_EXTERNAL_ORDER_ITEM_ID_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_EXTERNAL_ACCOUNT_ID_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_SALE_TYPE_ALIASES),
    resolveCsvColumnIndex(firstRow, CSV_PACKS_COUNT_ALIASES)
  ];
  const hasHeaderMatch = headerMatches.some((index) => isValidCsvColumnIndex(index, firstRow.length));

  const dataRows = hasHeaderMatch ? rows.slice(1) : rows;
  if (dataRows.length === 0) return null;

  const maxColumns = Math.max(
    hasHeaderMatch ? firstRow.length : 0,
    ...dataRows.map((row) => row.length)
  );
  if (maxColumns <= 0) return null;

  const headers = hasHeaderMatch
    ? normalizeCsvHeaders(firstRow, maxColumns)
    : normalizeCsvHeaders([], maxColumns);

  return {
    headers,
    rows: dataRows,
    mapping: buildMapping(headers)
  };
}

export function parseWhatnotCsvRowsWithMapping(
  rows: string[][],
  headersLength: number,
  mapping: WhatnotCsvColumnMapping,
  fallbackExternalAccountId = ""
): ParsedWhatnotCsvRowsResult {
  const entries: WhatnotImportReviewRow[] = [];
  let skippedCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => String(cell || "").trim().length > 0)) continue;

    const rawTitle = isValidCsvColumnIndex(mapping.title, headersLength) ? row[mapping.title] ?? "" : "";
    const rawListingTitle = isValidCsvColumnIndex(mapping.listingTitle, headersLength) ? row[mapping.listingTitle] ?? "" : "";
    const rawBuyerName = isValidCsvColumnIndex(mapping.buyerName, headersLength) ? row[mapping.buyerName] ?? "" : "";
    const rawOrderPlacedAt = isValidCsvColumnIndex(mapping.orderPlacedAt, headersLength) ? row[mapping.orderPlacedAt] ?? "" : "";
    const rawOriginalItemPrice = isValidCsvColumnIndex(mapping.originalItemPrice, headersLength) ? row[mapping.originalItemPrice] ?? "" : "";
    const title = rawTitle.trim();
    if (!title) {
      skippedCount += 1;
      continue;
    }

    const rawSku = isValidCsvColumnIndex(mapping.sku, headersLength) ? row[mapping.sku] ?? "" : "";
    const rawProductCategory = isValidCsvColumnIndex(mapping.productCategory, headersLength) ? row[mapping.productCategory] ?? "" : "";
    const rawQuantity = isValidCsvColumnIndex(mapping.quantity, headersLength) ? row[mapping.quantity] ?? "" : "";
    const rawPrice = isValidCsvColumnIndex(mapping.price, headersLength) ? row[mapping.price] ?? "" : "";
    const rawShipping = isValidCsvColumnIndex(mapping.buyerShipping, headersLength) ? row[mapping.buyerShipping] ?? "" : "";
    const rawDate = isValidCsvColumnIndex(mapping.date, headersLength) ? row[mapping.date] ?? "" : "";
    const rawOrderStatus = isValidCsvColumnIndex(mapping.orderStatus, headersLength) ? row[mapping.orderStatus] ?? "" : "";
    const normalizedOrderStatus = rawOrderStatus.trim().toUpperCase();
    if (normalizedOrderStatus === "TIP") {
      skippedCount += 1;
      continue;
    }
    const rawExternalSaleId = isValidCsvColumnIndex(mapping.externalSaleId, headersLength) ? row[mapping.externalSaleId] ?? "" : "";
    const rawExternalOrderId = isValidCsvColumnIndex(mapping.externalOrderId, headersLength) ? row[mapping.externalOrderId] ?? "" : "";
    const rawExternalOrderItemId = isValidCsvColumnIndex(mapping.externalOrderItemId, headersLength) ? row[mapping.externalOrderItemId] ?? "" : "";
    const rawExternalAccountId = isValidCsvColumnIndex(mapping.externalAccountId, headersLength)
      ? row[mapping.externalAccountId] ?? ""
      : "";
    const externalAccountId = rawExternalAccountId.trim() || String(fallbackExternalAccountId ?? "").trim();
    const rawSaleType = isValidCsvColumnIndex(mapping.saleType, headersLength) ? row[mapping.saleType] ?? "" : "";
    const rawPacksCount = isValidCsvColumnIndex(mapping.packsCount, headersLength) ? row[mapping.packsCount] ?? "" : "";

    const quantity = parsePositiveIntegerOrNull(rawQuantity) ?? 1;
    const price = parseCurrencyLikeNumber(rawPrice);
    const buyerShipping = parseCurrencyLikeNumber(rawShipping);
    const date = normalizeDateOnly(rawOrderPlacedAt) ?? normalizeDateOnly(rawDate);
    const suggestedSaleType = inferWhatnotSaleType(rawSaleType, title);
    const suggestedPacksCount = parsePositiveIntegerOrNull(rawPacksCount) ?? undefined;
    const rowId = buildRowId({
      rowId: `whatnot-csv:${index + 1}`,
      externalSaleId: rawExternalSaleId,
      externalOrderItemId: rawExternalOrderItemId,
      externalOrderId: rawExternalOrderId,
      externalAccountId: rawExternalAccountId
    }, index);

    entries.push({
      rowId,
      externalSaleId: buildValueOrFallback({ externalSaleId: rawExternalSaleId }, ["externalSaleId"], rowId),
      externalOrderId: buildValueOrFallback({ externalOrderId: rawExternalOrderId }, ["externalOrderId"], rowId),
      externalOrderItemId: buildValueOrFallback({ externalOrderItemId: rawExternalOrderItemId }, ["externalOrderItemId"], rowId),
      externalAccountId: externalAccountId,
      title,
      listingTitle: rawListingTitle.trim() || title,
      sku: rawSku.trim() || undefined,
      productCategory: rawProductCategory.trim() || undefined,
      buyerName: rawBuyerName.trim() || undefined,
      quantity,
      price,
      originalItemPrice: parseCurrencyLikeNumber(rawOriginalItemPrice) || undefined,
      buyerShipping,
      date: date ?? rawDate.trim(),
      orderPlacedAt: (normalizeDateOnly(rawOrderPlacedAt) ?? rawOrderPlacedAt.trim()) || undefined,
      orderPlacedAtRaw: rawOrderPlacedAt.trim() || undefined,
      orderStatus: rawOrderStatus.trim(),
      action: "create",
      suggestedSaleType: suggestedSaleType ?? undefined,
      suggestedPacksCount,
      matchSource: "none",
      requiresManualReview: true,
      selectedLotId: null,
      selectedSaleType: null,
      selectedPacksCount: null,
      skipImport: false
    });
  }

  return {
    entries,
    skippedCount
  };
}

export function normalizeWhatnotReviewRows(rows: unknown[]): WhatnotImportReviewRow[] {
  return rows.flatMap((rawRow, index): WhatnotImportReviewRow[] => {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      return [];
    }

    const row = rawRow as Record<string, unknown>;
    const title = buildValueOrFallback(row, ["title", "name", "product", "item", "description"], `Whatnot row ${index + 1}`);
    const suggestedSaleType = (() => {
      const explicit = String(row.suggestedSaleType ?? row.saleType ?? row.type ?? row.mode ?? "").trim().toLowerCase();
      if (explicit === "pack" || explicit === "box" || explicit === "rtyh") {
        return explicit as WhatnotMappedSaleType;
      }
      return inferWhatnotSaleType(row.saleType ?? row.type ?? row.mode, title) ?? undefined;
    })();
    const selectedSaleType = (() => {
      const explicit = String(row.selectedSaleType ?? row.suggestedSaleType ?? "").trim().toLowerCase();
      if (explicit === "pack" || explicit === "box" || explicit === "rtyh") {
        return explicit as WhatnotMappedSaleType;
      }
      return null;
    })();
    const suggestedPacksCount = parsePositiveIntegerOrNull(String(row.suggestedPacksCount ?? row.packsCount ?? row.packs ?? ""));
    const selectedPacksCount = parsePositiveIntegerOrNull(String(row.selectedPacksCount ?? row.suggestedPacksCount ?? row.packsCount ?? row.packs ?? ""));
    const suggestedLotId = parsePositiveIntegerOrNull(String(row.suggestedLotId ?? row.lotId ?? ""));
    const selectedLotId = parsePositiveIntegerOrNull(String(row.selectedLotId ?? row.suggestedLotId ?? row.lotId ?? ""));
    const externalSaleId = buildValueOrFallback(row, ["externalSaleId", "saleId"], buildRowId(row, index));
    const externalOrderId = buildValueOrFallback(row, ["externalOrderId", "orderId"], externalSaleId);
    const externalOrderItemId = buildValueOrFallback(row, ["externalOrderItemId", "orderItemId", "itemId"], externalSaleId);
    const externalAccountId = buildValueOrFallback(row, ["externalAccountId", "accountId", "sellerId"], "");
    const rowId = buildValueOrFallback(row, ["rowId"], externalSaleId || externalOrderItemId || `whatnot-row:${index + 1}`);
    const action = row.action === "update" || row.action === "skip" ? row.action : "create";
    const manualDuplicateCandidate = normalizeWhatnotManualDuplicateCandidate(row.manualDuplicateCandidate);
    const selectedImportAction = normalizeWhatnotReviewImportAction(row.selectedImportAction, action);
    const targetKind = normalizeWhatnotImportDecisionKind(row.targetKind)
      ?? (selectedImportAction === "update_existing"
        ? (manualDuplicateCandidate
          ? "manual_candidate"
          : String(row.existingSaleId ?? "").trim()
            ? "whatnot_mapping"
            : null)
        : selectedImportAction === "create"
          ? "new"
          : null);
    const targetSaleId = String(row.targetSaleId ?? "").trim()
      || (selectedImportAction === "update_existing"
        ? manualDuplicateCandidate?.saleId || String(row.existingSaleId ?? "").trim()
        : "");
    const matchSource = row.matchSource === "remembered" || row.matchSource === "title" ? row.matchSource : "none";
    const requiresManualReview = row.requiresManualReview === false ? false : true;

    return [{
      rowId,
      externalSaleId,
      externalOrderId,
      externalOrderItemId,
      externalAccountId,
      title,
      listingTitle: String(row.listingTitle ?? row.title ?? row.name ?? "").trim() || undefined,
      sku: String(row.sku ?? "").trim() || undefined,
      productCategory: String(row.productCategory ?? "").trim() || undefined,
      buyerName: String(row.buyerName ?? row.customer ?? "").trim() || undefined,
      quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
      price: Number(row.price) || 0,
      originalItemPrice: Number(row.originalItemPrice) || undefined,
      buyerShipping: Number(row.buyerShipping) || 0,
      date: String(row.date ?? "").trim(),
      orderPlacedAt: String(row.orderPlacedAt ?? "").trim() || undefined,
      orderPlacedAtRaw: String(row.orderPlacedAtRaw ?? "").trim() || undefined,
      orderStatus: String(row.orderStatus ?? "").trim(),
      listingId: String(row.listingId ?? "").trim() || undefined,
      productId: String(row.productId ?? "").trim() || undefined,
      variantId: String(row.variantId ?? "").trim() || undefined,
      action,
      suggestedLotId: suggestedLotId ?? undefined,
      suggestedSaleType,
      suggestedPacksCount: suggestedPacksCount ?? undefined,
      matchSource,
      existingSaleId: String(row.existingSaleId ?? "").trim() || undefined,
      requiresManualReview,
      selectedLotId: selectedLotId ?? null,
      selectedSaleType,
      selectedPacksCount: selectedPacksCount ?? null,
      selectedImportAction,
      targetKind,
      targetSaleId: targetSaleId || undefined,
      manualDuplicateCandidate,
      skipImport: row.skipImport === true || action === "skip" || selectedImportAction === "skip"
    }];
  });
}

function normalizeWhatnotReviewImportAction(
  value: unknown,
  fallbackAction: WhatnotSaleImportAction
): WhatnotReviewImportAction {
  const explicit = String(value ?? "").trim().toLowerCase();
  if (explicit === "create" || explicit === "update_existing" || explicit === "skip") {
    return explicit;
  }
  if (fallbackAction === "update") return "update_existing";
  if (fallbackAction === "skip") return "skip";
  return "create";
}

function normalizeWhatnotImportDecisionKind(value: unknown): WhatnotImportDecisionKind | null {
  const explicit = String(value ?? "").trim();
  if (explicit === "new" || explicit === "whatnot_mapping" || explicit === "manual_candidate") {
    return explicit;
  }
  return null;
}

function normalizeWhatnotManualDuplicateCandidate(value: unknown): WhatnotManualDuplicateCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const saleSummarySource = candidate.saleSummary && typeof candidate.saleSummary === "object" && !Array.isArray(candidate.saleSummary)
    ? candidate.saleSummary as Record<string, unknown>
    : {};
  const saleId = String(candidate.saleId ?? candidate.id ?? "").trim();
  const reasonSummary = String(candidate.reasonSummary ?? candidate.reason ?? "").trim();
  if (!saleId || !reasonSummary) {
    return null;
  }

  const confidence = String(candidate.confidence ?? "").trim().toLowerCase() === "high" ? "high" : "medium";
  return {
    saleId,
    confidence,
    reasonSummary,
    saleSummary: {
      date: String(saleSummarySource.date ?? "").trim(),
      price: Number(saleSummarySource.price) || 0,
      quantity: Math.max(1, Math.floor(Number(saleSummarySource.quantity) || 1)),
      packsCount: Math.max(1, Math.floor(Number(saleSummarySource.packsCount) || 1)),
      customer: String(saleSummarySource.customer ?? "").trim() || undefined,
      memo: String(saleSummarySource.memo ?? "").trim() || undefined
    }
  };
}



