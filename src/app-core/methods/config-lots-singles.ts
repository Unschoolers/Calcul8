import type { Lot, SinglesPurchaseEntry } from "../../types/app.ts";
import { resolveDefaultSinglesMarketValueCurrency } from "../shared/singles-market-value-currency.ts";
import {
  applySinglesCsvImportRows,
  buildSinglesCsvImportDraft,
  isValidCsvColumnIndex,
  parseSinglesCsvRowsWithMapping,
  summarizeSinglesCsvImportOutcome
} from "./config-lots-import.ts";
import {
  createNextSinglesEntryId,
  normalizeSinglesPurchaseEntries,
  resetSinglesCsvImportState,
  resolveCurrentLot,
  type SinglesCsvImportStateTarget
} from "./config-lots-state.ts";
import { removeById } from "../shared/collection-updaters.ts";

export type SinglesRowsContext = {
  currentLotType: Lot["lotType"];
  currentLotId: number | null;
  currency: "CAD" | "USD";
  lots: Lot[];
  singlesPurchases: SinglesPurchaseEntry[];
  recalculateDefaultPrices(): void;
};

export type SinglesCsvWorkflowContext = SinglesCsvImportStateTarget & {
  currentLotType: Lot["lotType"];
  currency: "CAD" | "USD";
  singlesPurchases: SinglesPurchaseEntry[];
  onSinglesPurchaseRowsChange(): void;
  notify(message: string, color?: string): void;
};

export function appendBlankSinglesPurchaseRow(
  rows: SinglesPurchaseEntry[],
  currency: "CAD" | "USD",
  marketValueCurrency: "CAD" | "USD" = currency
): SinglesPurchaseEntry[] {
  return [
    ...rows,
    {
      id: createNextSinglesEntryId(rows),
      item: "",
      cardNumber: "",
      externalSku: "",
      condition: "",
      language: "",
      cost: 0,
      currency,
      quantity: 1,
      marketValue: 0,
      marketValueCurrency
    }
  ];
}

export function removeSinglesPurchaseRowById(rows: SinglesPurchaseEntry[], rowId: number): SinglesPurchaseEntry[] {
  return removeById(rows, rowId);
}

export function syncSinglesPurchaseRows(context: SinglesRowsContext): void {
  if (context.currentLotType !== "singles") return;
  const lot = resolveCurrentLot(context.lots, context.currentLotId);
  const defaultMarketValueCurrency = resolveDefaultSinglesMarketValueCurrency(
    lot?.lotType === "singles" ? lot.singlesCatalogSource : undefined,
    context.currency === "USD" ? "USD" : "CAD"
  );

  const normalizedRows = normalizeSinglesPurchaseEntries(
    context.singlesPurchases,
    context.currency === "USD" ? "USD" : "CAD",
    defaultMarketValueCurrency
  );
  context.singlesPurchases = normalizedRows;

  if (!lot || lot.lotType !== "singles") return;

  lot.singlesPurchases = [...normalizedRows];
  context.recalculateDefaultPrices();
}

export function beginSinglesCsvImport(context: SinglesCsvWorkflowContext, rawCsv: string): boolean {
  const draft = buildSinglesCsvImportDraft(rawCsv);
  if (!draft) {
    return false;
  }

  context.singlesCsvImportHeaders = draft.headers;
  context.singlesCsvImportRows = draft.rows;
  context.singlesCsvImportCurrency = context.currency === "USD" ? "USD" : "CAD";
  context.singlesCsvImportMode = "merge";
  context.singlesCsvMapItem = draft.mapping.item;
  context.singlesCsvMapCardNumber = draft.mapping.cardNumber;
  context.singlesCsvMapCondition = draft.mapping.condition;
  context.singlesCsvMapLanguage = draft.mapping.language;
  context.singlesCsvMapCost = draft.mapping.cost;
  context.singlesCsvMapQuantity = draft.mapping.quantity;
  context.singlesCsvMapMarketValue = draft.mapping.marketValue;
  context.showSinglesCsvMapperModal = true;
  return true;
}

export function confirmSinglesCsvImport(context: SinglesCsvWorkflowContext): { ok: boolean; message?: string } {
  const headers = context.singlesCsvImportHeaders;
  const rows = context.singlesCsvImportRows;
  if (headers.length === 0 || rows.length === 0) {
    resetSinglesCsvImportState(context, context.currency === "USD" ? "USD" : "CAD");
    return { ok: false, message: "No CSV data available to import." };
  }

  if (!isValidCsvColumnIndex(context.singlesCsvMapItem, headers.length) ||
    !isValidCsvColumnIndex(context.singlesCsvMapQuantity, headers.length)) {
    return { ok: false, message: "Map Item and Quantity columns before importing." };
  }

  const parsedResult = parseSinglesCsvRowsWithMapping(rows, headers.length, {
    item: context.singlesCsvMapItem,
    cardNumber: context.singlesCsvMapCardNumber,
    condition: context.singlesCsvMapCondition,
    language: context.singlesCsvMapLanguage,
    cost: context.singlesCsvMapCost,
    quantity: context.singlesCsvMapQuantity,
    marketValue: context.singlesCsvMapMarketValue
  }, context.singlesCsvImportCurrency === "USD" ? "USD" : "CAD");
  if (parsedResult.entries.length === 0) {
    return { ok: false, message: "No valid rows found with current mapping." };
  }

  const appliedImport = applySinglesCsvImportRows({
    existingRows: context.singlesPurchases,
    parsedRows: parsedResult.entries,
    importMode: context.singlesCsvImportMode
  });

  context.singlesPurchases = appliedImport.rows;
  context.onSinglesPurchaseRowsChange();
  resetSinglesCsvImportState(context, context.currency === "USD" ? "USD" : "CAD");

  return {
    ok: true,
    message: summarizeSinglesCsvImportOutcome({
      mode: appliedImport.mode,
      addedCount: appliedImport.addedCount,
      mergedCount: appliedImport.mergedCount,
      ambiguousCount: appliedImport.ambiguousCount,
      replacedCount: appliedImport.replacedCount,
      skippedCount: parsedResult.skippedCount
    })
  };
}
