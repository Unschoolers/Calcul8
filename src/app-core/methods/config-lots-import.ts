import type {
  CurrencyCode,
  SinglesCsvColumnMapping,
  SinglesCsvImportMode,
  SinglesPurchaseEntry
} from "../../types/app.ts";

const CSV_ITEM_ALIASES = [
  "item",
  "card",
  "cardname",
  "name",
  "title",
  "product"
];
const CSV_CARD_NUMBER_ALIASES = [
  "number",
  "cardnumber",
  "cardno",
  "collectornumber",
  "setnumber",
  "cardid"
];
const CSV_CONDITION_ALIASES = [
  "condition",
  "cardcondition",
  "state",
  "grade",
  "quality"
];
const CSV_LANGUAGE_ALIASES = [
  "language",
  "lang",
  "cardlanguage",
  "locale"
];
const CSV_COST_ALIASES = [
  "price",
  "purchaseprice",
  "buyprice",
  "cost",
  "paid"
];
const CSV_QUANTITY_ALIASES = [
  "quantity",
  "qty",
  "count",
  "owned"
];
const CSV_MARKET_VALUE_ALIASES = [
  "marketvalue",
  "market",
  "marketprice",
  "value",
  "mv"
];

export interface SinglesCsvImportDraft {
  headers: string[];
  rows: string[][];
  mapping: SinglesCsvColumnMapping;
}

export interface ParsedSinglesCsvRowsResult {
  entries: Array<Omit<SinglesPurchaseEntry, "id">>;
  skippedCount: number;
}

export interface AppliedSinglesCsvImportResult {
  mode: "merge" | "sync" | "append";
  rows: SinglesPurchaseEntry[];
  addedCount: number;
  mergedCount: number;
  ambiguousCount: number;
  replacedCount: number;
}

function normalizeCsvToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
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

function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    const next = raw[index + 1];

    if (current === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
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
  const normalizedAliases = new Set(aliases.map((alias) => normalizeCsvToken(alias)));
  return headers.findIndex((header) => normalizedAliases.has(normalizeCsvToken(header)));
}

export function isValidCsvColumnIndex(index: number | null, headersLength: number): index is number {
  return Number.isInteger(index) && Number(index) >= 0 && Number(index) < headersLength;
}

function inferSinglesCsvAliasMapping(headers: string[]): SinglesCsvColumnMapping {
  const itemIndex = resolveCsvColumnIndex(headers, CSV_ITEM_ALIASES);
  const cardNumberIndex = resolveCsvColumnIndex(headers, CSV_CARD_NUMBER_ALIASES);
  const conditionIndex = resolveCsvColumnIndex(headers, CSV_CONDITION_ALIASES);
  const languageIndex = resolveCsvColumnIndex(headers, CSV_LANGUAGE_ALIASES);
  const costIndex = resolveCsvColumnIndex(headers, CSV_COST_ALIASES);
  const quantityIndex = resolveCsvColumnIndex(headers, CSV_QUANTITY_ALIASES);
  const marketValueIndex = resolveCsvColumnIndex(headers, CSV_MARKET_VALUE_ALIASES);
  return {
    item: itemIndex >= 0 ? itemIndex : null,
    cardNumber: cardNumberIndex >= 0 ? cardNumberIndex : null,
    condition: conditionIndex >= 0 ? conditionIndex : null,
    language: languageIndex >= 0 ? languageIndex : null,
    cost: costIndex >= 0 ? costIndex : null,
    quantity: quantityIndex >= 0 ? quantityIndex : null,
    marketValue: marketValueIndex >= 0 ? marketValueIndex : null
  };
}

function normalizeCsvHeaders(headers: string[], totalColumns: number): string[] {
  return Array.from({ length: totalColumns }, (_, index) => {
    const raw = headers[index] ?? "";
    return raw.trim() || `Column ${index + 1}`;
  });
}

export function buildSinglesCsvImportDraft(raw: string): SinglesCsvImportDraft | null {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const inferredHeaderMapping = inferSinglesCsvAliasMapping(firstRow);
  const hasHeaderMatch = [
    inferredHeaderMapping.item,
    inferredHeaderMapping.cardNumber,
    inferredHeaderMapping.condition,
    inferredHeaderMapping.language,
    inferredHeaderMapping.cost,
    inferredHeaderMapping.quantity,
    inferredHeaderMapping.marketValue
  ]
    .some((index) => isValidCsvColumnIndex(index, firstRow.length));
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
    mapping: inferSinglesCsvAliasMapping(headers)
  };
}

export function parseSinglesCsvRowsWithMapping(
  rows: string[][],
  headersLength: number,
  mapping: SinglesCsvColumnMapping,
  importCurrency: CurrencyCode
): ParsedSinglesCsvRowsResult {
  const parsedRows: Array<Omit<SinglesPurchaseEntry, "id">> = [];
  let skippedCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => String(cell || "").trim().length > 0)) continue;

    const rawItem = isValidCsvColumnIndex(mapping.item, headersLength) ? row[mapping.item] ?? "" : "";
    const rawCardNumber = isValidCsvColumnIndex(mapping.cardNumber, headersLength) ? row[mapping.cardNumber] ?? "" : "";
    const rawCondition = isValidCsvColumnIndex(mapping.condition, headersLength) ? row[mapping.condition] ?? "" : "";
    const rawLanguage = isValidCsvColumnIndex(mapping.language, headersLength) ? row[mapping.language] ?? "" : "";
    const rawCost = isValidCsvColumnIndex(mapping.cost, headersLength) ? row[mapping.cost] ?? "" : "";
    const rawQuantity = isValidCsvColumnIndex(mapping.quantity, headersLength) ? row[mapping.quantity] ?? "" : "";
    const rawMarketValue = isValidCsvColumnIndex(mapping.marketValue, headersLength) ? row[mapping.marketValue] ?? "" : "";

    const item = rawItem.trim();
    const quantity = parsePositiveIntegerOrNull(rawQuantity);
    if (!item || quantity == null) {
      skippedCount += 1;
      continue;
    }

    parsedRows.push({
      item,
      cardNumber: rawCardNumber.trim(),
      condition: rawCondition.trim(),
      language: rawLanguage.trim(),
      cost: parseCurrencyLikeNumber(rawCost),
      currency: importCurrency,
      quantity,
      marketValue: parseCurrencyLikeNumber(rawMarketValue)
    });
  }

  return {
    entries: parsedRows,
    skippedCount
  };
}

function toSinglesMergeKey(
  item: unknown,
  cardNumber: unknown,
  condition: unknown,
  language: unknown
): string | null {
  const normalizedItem = String(item || "").trim().toLocaleLowerCase();
  const normalizedCardNumber = String(cardNumber || "").trim().toLocaleLowerCase();
  const normalizedCondition = String(condition || "").trim().toLocaleLowerCase();
  const normalizedLanguage = String(language || "").trim().toLocaleLowerCase();
  if (!normalizedItem || !normalizedCardNumber) return null;
  return `${normalizedItem}::${normalizedCardNumber}::${normalizedCondition}::${normalizedLanguage}`;
}

function toSinglesBaseMergeKey(item: unknown, cardNumber: unknown): string | null {
  const normalizedItem = String(item || "").trim().toLocaleLowerCase();
  const normalizedCardNumber = String(cardNumber || "").trim().toLocaleLowerCase();
  if (!normalizedItem || !normalizedCardNumber) return null;
  return `${normalizedItem}::${normalizedCardNumber}`;
}

function resolveImportMode(mode: SinglesCsvImportMode): "merge" | "sync" | "append" {
  if (mode === "sync") return "sync";
  if (mode === "append") return "append";
  return "merge";
}

export function applySinglesCsvImportRows(params: {
  existingRows: SinglesPurchaseEntry[];
  parsedRows: Array<Omit<SinglesPurchaseEntry, "id">>;
  importMode: SinglesCsvImportMode;
  now?: number;
}): AppliedSinglesCsvImportResult {
  const mode = resolveImportMode(params.importMode);
  const replacedCount = mode === "sync" ? params.existingRows.length : 0;
  const shouldMerge = mode !== "append";
  const nextRows: SinglesPurchaseEntry[] = mode === "sync"
    ? []
    : params.existingRows.map((entry) => ({ ...entry }));
  const mergeIndexByKey = new Map<string, number>();
  const mergeIndicesByBaseKey = new Map<string, number[]>();

  const indexMergeCandidate = (entry: Omit<SinglesPurchaseEntry, "id"> | SinglesPurchaseEntry, index: number): void => {
    const key = toSinglesMergeKey(entry.item, entry.cardNumber, entry.condition, entry.language);
    if (key && !mergeIndexByKey.has(key)) {
      mergeIndexByKey.set(key, index);
    }
    const baseKey = toSinglesBaseMergeKey(entry.item, entry.cardNumber);
    if (!baseKey) return;
    const indices = mergeIndicesByBaseKey.get(baseKey);
    if (indices) {
      indices.push(index);
      return;
    }
    mergeIndicesByBaseKey.set(baseKey, [index]);
  };

  if (shouldMerge) {
    nextRows.forEach((entry, index) => {
      indexMergeCandidate(entry, index);
    });
  }

  let mergedCount = 0;
  let ambiguousCount = 0;
  let addedCount = 0;
  const highestExistingId = nextRows.reduce((maxId, entry) => {
    const candidateId = Number(entry.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) return maxId;
    return Math.max(maxId, Math.floor(candidateId));
  }, 0);
  let nextId = Math.max(params.now ?? Date.now(), highestExistingId + 1);

  params.parsedRows.forEach((row) => {
    const mergeKey = shouldMerge
      ? toSinglesMergeKey(row.item, row.cardNumber, row.condition, row.language)
      : null;
    if (shouldMerge && mergeKey) {
      const existingIndex = mergeIndexByKey.get(mergeKey);
      if (existingIndex != null) {
        const existing = nextRows[existingIndex];
        const existingQuantity = Math.max(0, Math.floor(Number(existing.quantity) || 0));
        nextRows[existingIndex] = {
          ...existing,
          quantity: existingQuantity + 1
        };
        mergedCount += 1;
        return;
      }
    }

    if (shouldMerge) {
      const normalizedCondition = String(row.condition || "").trim();
      const normalizedLanguage = String(row.language || "").trim();
      if (!normalizedCondition && !normalizedLanguage) {
        const baseKey = toSinglesBaseMergeKey(row.item, row.cardNumber);
        if (baseKey) {
          const baseIndices = mergeIndicesByBaseKey.get(baseKey) ?? [];
          if (baseIndices.length === 1) {
            const existingIndex = baseIndices[0]!;
            const existing = nextRows[existingIndex];
            const existingQuantity = Math.max(0, Math.floor(Number(existing.quantity) || 0));
            nextRows[existingIndex] = {
              ...existing,
              quantity: existingQuantity + 1
            };
            mergedCount += 1;
            return;
          }
          if (baseIndices.length > 1) {
            ambiguousCount += 1;
          }
        }
      }
    }

    nextRows.push({
      id: nextId,
      ...row
    });
    nextId += 1;
    addedCount += 1;
    if (shouldMerge) {
      indexMergeCandidate(row, nextRows.length - 1);
    }
  });

  return {
    mode,
    rows: nextRows,
    addedCount,
    mergedCount,
    ambiguousCount,
    replacedCount
  };
}

export function summarizeSinglesCsvImportOutcome(params: {
  mode: "merge" | "sync" | "append";
  addedCount: number;
  mergedCount: number;
  ambiguousCount: number;
  replacedCount: number;
  skippedCount: number;
}): string {
  const summaryParts: string[] = [];
  if (params.mode === "sync" && params.replacedCount > 0) {
    summaryParts.push(`${params.replacedCount} existing row${params.replacedCount === 1 ? "" : "s"} replaced`);
  }
  if (params.mergedCount > 0) {
    summaryParts.push(`${params.mergedCount} merged into existing rows`);
  }
  if (params.ambiguousCount > 0) {
    summaryParts.push(`${params.ambiguousCount} not merged: ambiguous Item + Number match`);
  }
  if (params.skippedCount > 0) {
    summaryParts.push(`${params.skippedCount} skipped: missing Item or Quantity`);
  }
  const summarySuffix = summaryParts.length > 0
    ? ` (${summaryParts.join("; ")})`
    : "";
  const actionLabel = params.mode === "sync"
    ? "Synced"
    : params.mode === "append"
      ? "Appended"
      : "Imported";
  return `${actionLabel} ${params.addedCount} item${params.addedCount === 1 ? "" : "s"} from CSV${summarySuffix}.`;
}
