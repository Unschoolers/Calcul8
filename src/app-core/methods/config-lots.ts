import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot, LotSetup, SinglesCsvColumnMapping, SinglesPurchaseEntry } from "../../types/app.ts";
import {
  getLegacySalesStorageKey,
  getLegacyStorageKeys,
  readStorageWithLegacy,
  removeStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";
import { type ConfigMethodSubset, getTodayDate, inferDateFromLotId, toDateOnly } from "./config-shared.ts";

const LEGACY_KEYS = getLegacyStorageKeys();
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

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function toNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return rounded >= 0 ? rounded : fallback;
}

function normalizeSinglesPurchaseEntries(
  entries: SinglesPurchaseEntry[] | undefined
): SinglesPurchaseEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries.map((entry, index) => {
    const id = Number(entry.id);
    return {
      id: Number.isFinite(id) && id > 0 ? id : Date.now() + index,
      item: typeof entry.item === "string" ? entry.item.trim() : "",
      cardNumber: typeof entry.cardNumber === "string" ? entry.cardNumber.trim() : "",
      cost: toNonNegativeNumber(entry.cost),
      quantity: toNonNegativeInteger(entry.quantity),
      marketValue: toNonNegativeNumber(entry.marketValue)
    };
  });
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

function isValidCsvColumnIndex(index: number | null, headersLength: number): index is number {
  return Number.isInteger(index) && Number(index) >= 0 && Number(index) < headersLength;
}

function inferSinglesCsvAliasMapping(headers: string[]): SinglesCsvColumnMapping {
  const itemIndex = resolveCsvColumnIndex(headers, CSV_ITEM_ALIASES);
  const cardNumberIndex = resolveCsvColumnIndex(headers, CSV_CARD_NUMBER_ALIASES);
  const costIndex = resolveCsvColumnIndex(headers, CSV_COST_ALIASES);
  const quantityIndex = resolveCsvColumnIndex(headers, CSV_QUANTITY_ALIASES);
  const marketValueIndex = resolveCsvColumnIndex(headers, CSV_MARKET_VALUE_ALIASES);
  return {
    item: itemIndex >= 0 ? itemIndex : null,
    cardNumber: cardNumberIndex >= 0 ? cardNumberIndex : null,
    cost: costIndex >= 0 ? costIndex : null,
    quantity: quantityIndex >= 0 ? quantityIndex : null,
    marketValue: marketValueIndex >= 0 ? marketValueIndex : null
  };
}

function inferSinglesCsvMapping(headers: string[]): SinglesCsvColumnMapping {
  return inferSinglesCsvAliasMapping(headers);
}

function normalizeCsvHeaders(headers: string[], totalColumns: number): string[] {
  return Array.from({ length: totalColumns }, (_, index) => {
    const raw = headers[index] ?? "";
    return raw.trim() || `Column ${index + 1}`;
  });
}

function buildSinglesCsvImportDraft(raw: string): {
  headers: string[];
  rows: string[][];
  mapping: SinglesCsvColumnMapping;
} | null {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const inferredHeaderMapping = inferSinglesCsvAliasMapping(firstRow);
  const hasHeaderMatch = [
    inferredHeaderMapping.item,
    inferredHeaderMapping.cardNumber,
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
    mapping: inferSinglesCsvMapping(headers)
  };
}

function parseSinglesCsvRowsWithMapping(
  rows: string[][],
  headersLength: number,
  mapping: SinglesCsvColumnMapping
): {
  entries: Array<Omit<SinglesPurchaseEntry, "id">>;
  skippedCount: number;
} {
  const parsedRows: Array<Omit<SinglesPurchaseEntry, "id">> = [];
  let skippedCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => String(cell || "").trim().length > 0)) {
      continue;
    }

    const rawItem = isValidCsvColumnIndex(mapping.item, headersLength) ? row[mapping.item] ?? "" : "";
    const rawCardNumber = isValidCsvColumnIndex(mapping.cardNumber, headersLength) ? row[mapping.cardNumber] ?? "" : "";
    const rawCost = isValidCsvColumnIndex(mapping.cost, headersLength) ? row[mapping.cost] ?? "" : "";
    const rawQuantity = isValidCsvColumnIndex(mapping.quantity, headersLength) ? row[mapping.quantity] ?? "" : "";
    const rawMarketValue = isValidCsvColumnIndex(mapping.marketValue, headersLength) ? row[mapping.marketValue] ?? "" : "";

    const item = rawItem.trim();
    const cost = parseCurrencyLikeNumber(rawCost);
    const quantity = parsePositiveIntegerOrNull(rawQuantity);
    if (!item || quantity == null) {
      skippedCount += 1;
      continue;
    }
    const marketValue = parseCurrencyLikeNumber(rawMarketValue);
    const cardNumber = rawCardNumber.trim();

    parsedRows.push({
      item,
      cardNumber,
      cost,
      quantity,
      marketValue
    });
  }

  return {
    entries: parsedRows,
    skippedCount
  };
}

function toSinglesMergeKey(item: unknown, cardNumber: unknown): string | null {
  const normalizedItem = String(item || "").trim().toLocaleLowerCase();
  const normalizedCardNumber = String(cardNumber || "").trim().toLocaleLowerCase();
  if (!normalizedItem || !normalizedCardNumber) return null;
  return `${normalizedItem}::${normalizedCardNumber}`;
}

function resolveCurrentLot(lots: Lot[], lotId: number | null): Lot | null {
  if (!lotId) return null;
  return lots.find((lot) => lot.id === lotId) ?? null;
}

export const configLotMethods: ConfigMethodSubset<
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "addSinglesPurchaseRow"
  | "removeSinglesPurchaseRow"
  | "clearSinglesPurchases"
  | "onSinglesPurchaseRowsChange"
  | "importSinglesPurchasesCsv"
  | "confirmSinglesPurchasesCsvImport"
  | "cancelSinglesPurchasesCsvImport"
  | "createNewLot"
  | "openRenameLotModal"
  | "renameCurrentLot"
  | "loadLot"
  | "deleteCurrentLot"
> = {
  getCurrentSetup(): LotSetup {
    return {
      boxPriceCost: this.boxPriceCost,
      boxesPurchased: this.boxesPurchased,
      packsPerBox: this.packsPerBox,
      spotsPerBox: this.spotsPerBox,
      costInputMode: this.costInputMode,
      currency: this.currency,
      sellingCurrency: this.sellingCurrency,
      exchangeRate: this.exchangeRate,
      purchaseDate: this.purchaseDate,
      purchaseShippingCost: this.purchaseShippingCost,
      purchaseTaxPercent: this.purchaseTaxPercent,
      sellingTaxPercent: this.sellingTaxPercent,
      sellingShippingPerOrder: this.sellingShippingPerOrder,
      includeTax: this.includeTax,
      spotPrice: this.spotPrice,
      boxPriceSell: this.boxPriceSell,
      packPrice: this.packPrice,
      targetProfitPercent: this.targetProfitPercent
    };
  },

  autoSaveSetup(): void {
    if (!this.currentLotId) return;
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;

    Object.assign(lot, this.getCurrentSetup());
    this.saveLotsToStorage();
  },

  syncLivePricesFromDefaults(): void {
    this.liveSpotPrice = this.spotPrice;
    this.liveBoxPriceSell = this.boxPriceSell;
    this.livePackPrice = this.packPrice;
  },

  resetLivePrices(): void {
    this.syncLivePricesFromDefaults();
    this.notify("Live prices reset to config defaults", "info");
  },

  applyLivePricesToDefaults(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }

    this.spotPrice = Number(this.liveSpotPrice) || 0;
    this.boxPriceSell = Number(this.liveBoxPriceSell) || 0;
    this.packPrice = Number(this.livePackPrice) || 0;
    this.autoSaveSetup();
    void this.pushCloudSync();
    this.notify("Live prices saved to config", "success");
  },

  addSinglesPurchaseRow(): void {
    if (this.currentLotType !== "singles") return;

    this.singlesPurchases = [
      ...this.singlesPurchases,
      {
        id: Date.now(),
        item: "",
        cardNumber: "",
        cost: 0,
        quantity: 1,
        marketValue: 0
      }
    ];
    this.onSinglesPurchaseRowsChange();
  },

  removeSinglesPurchaseRow(rowId: number): void {
    if (this.currentLotType !== "singles") return;

    this.singlesPurchases = this.singlesPurchases.filter((entry) => entry.id !== rowId);
    this.onSinglesPurchaseRowsChange();
  },

  clearSinglesPurchases(): void {
    if (this.currentLotType !== "singles") return;
    if (this.singlesPurchases.length === 0) return;

    this.singlesPurchases = [];
    this.onSinglesPurchaseRowsChange();
    this.notify("Cleared singles purchase rows.", "info");
  },

  onSinglesPurchaseRowsChange(): void {
    if (this.currentLotType !== "singles") return;

    const normalizedRows = normalizeSinglesPurchaseEntries(this.singlesPurchases);
    this.singlesPurchases = normalizedRows;

    const lot = resolveCurrentLot(this.lots, this.currentLotId);
    if (!lot || lot.lotType !== "singles") return;

    lot.singlesPurchases = [...normalizedRows];
    this.recalculateDefaultPrices();
  },

  importSinglesPurchasesCsv(): void {
    if (this.currentLotType !== "singles") return;

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".csv,text/csv";
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = reader.result;
          if (typeof raw !== "string") {
            this.notify("Could not read CSV file.", "error");
            return;
          }

          const draft = buildSinglesCsvImportDraft(raw);
          if (!draft) {
            this.notify("No valid rows found in CSV.", "warning");
            return;
          }

          this.singlesCsvImportHeaders = draft.headers;
          this.singlesCsvImportRows = draft.rows;
          this.singlesCsvMapItem = draft.mapping.item;
          this.singlesCsvMapCardNumber = draft.mapping.cardNumber;
          this.singlesCsvMapCost = draft.mapping.cost;
          this.singlesCsvMapQuantity = draft.mapping.quantity;
          this.singlesCsvMapMarketValue = draft.mapping.marketValue;
          this.showSinglesCsvMapperModal = true;
        } catch (error) {
          console.warn("Failed to import singles purchase CSV", error);
          this.notify("Could not import CSV. Check the file format.", "error");
        }
      };
      reader.onerror = () => {
        this.notify("Could not read CSV file.", "error");
      };
      reader.readAsText(file);
    };
    picker.click();
  },

  confirmSinglesPurchasesCsvImport(): void {
    if (this.currentLotType !== "singles") return;

    const headers = this.singlesCsvImportHeaders;
    const rows = this.singlesCsvImportRows;
    if (headers.length === 0 || rows.length === 0) {
      this.cancelSinglesPurchasesCsvImport();
      this.notify("No CSV data available to import.", "warning");
      return;
    }

    if (!isValidCsvColumnIndex(this.singlesCsvMapItem, headers.length) ||
      !isValidCsvColumnIndex(this.singlesCsvMapQuantity, headers.length)) {
      this.notify("Map Item and Quantity columns before importing.", "warning");
      return;
    }

    const parsedResult = parseSinglesCsvRowsWithMapping(rows, headers.length, {
      item: this.singlesCsvMapItem,
      cardNumber: this.singlesCsvMapCardNumber,
      cost: this.singlesCsvMapCost,
      quantity: this.singlesCsvMapQuantity,
      marketValue: this.singlesCsvMapMarketValue
    });
    const parsed = parsedResult.entries;

    if (parsed.length === 0) {
      this.notify("No valid rows found with current mapping.", "warning");
      return;
    }

    const nextRows: SinglesPurchaseEntry[] = this.singlesPurchases
      .map((entry) => ({ ...entry }));
    const mergeIndexByKey = new Map<string, number>();
    nextRows.forEach((entry, index) => {
      const key = toSinglesMergeKey(entry.item, entry.cardNumber);
      if (!key) return;
      if (!mergeIndexByKey.has(key)) {
        mergeIndexByKey.set(key, index);
      }
    });

    let mergedCount = 0;
    let addedCount = 0;
    let nextId = Date.now();

    parsed.forEach((row) => {
      const mergeKey = toSinglesMergeKey(row.item, row.cardNumber);
      if (mergeKey) {
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

      const nextRow: SinglesPurchaseEntry = {
        id: nextId,
        ...row
      };
      nextId += 1;
      nextRows.push(nextRow);
      addedCount += 1;
      if (mergeKey) {
        mergeIndexByKey.set(mergeKey, nextRows.length - 1);
      }
    });

    this.singlesPurchases = nextRows;
    this.onSinglesPurchaseRowsChange();
    this.cancelSinglesPurchasesCsvImport();
    const summaryParts: string[] = [];
    if (mergedCount > 0) {
      summaryParts.push(`${mergedCount} merged into existing rows`);
    }
    if (parsedResult.skippedCount > 0) {
      summaryParts.push(`${parsedResult.skippedCount} skipped: missing Item or Quantity`);
    }
    const summarySuffix = summaryParts.length > 0
      ? ` (${summaryParts.join("; ")})`
      : "";
    this.notify(`Imported ${addedCount} item${addedCount === 1 ? "" : "s"} from CSV${summarySuffix}.`, "success");
  },

  cancelSinglesPurchasesCsvImport(): void {
    this.showSinglesCsvMapperModal = false;
    this.singlesCsvImportHeaders = [];
    this.singlesCsvImportRows = [];
    this.singlesCsvMapItem = null;
    this.singlesCsvMapCardNumber = null;
    this.singlesCsvMapCost = null;
    this.singlesCsvMapQuantity = null;
    this.singlesCsvMapMarketValue = null;
  },

  createNewLot(): void {
    const name = (this.newLotName || "").trim();
    if (!name) return this.notify("Please enter a lot name", "warning");
    if (this.lots.some((p) => p.name === name)) return this.notify("A lot with this name already exists", "warning");

    const todayDate = getTodayDate();
    const setup = this.getCurrentSetup();
    const nextLotType = this.newLotType === "singles" ? "singles" : "bulk";
    const selectedLot = this.currentLotId ? this.lots.find((p) => p.id === this.currentLotId) : null;
    const fallbackPreviousLot = this.lots.length > 0 ? this.lots[this.lots.length - 1] : null;
    const previousSellingTaxRaw =
      selectedLot?.sellingTaxPercent ??
      fallbackPreviousLot?.sellingTaxPercent ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    const previousSellingTax = Number(previousSellingTaxRaw);
    setup.sellingTaxPercent =
      Number.isFinite(previousSellingTax) && previousSellingTax >= 0
        ? previousSellingTax
        : DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    setup.purchaseDate = todayDate;

    if (this.purchaseUiMode === "simple") {
      setup.purchaseShippingCost = 0;
      setup.purchaseTaxPercent = 0;
    }

    if (nextLotType === "singles") {
      setup.costInputMode = "total";
      setup.boxPriceCost = 0;
      setup.boxesPurchased = 0;
      setup.packsPerBox = 1;
      setup.purchaseShippingCost = 0;
      setup.purchaseTaxPercent = 0;
      setup.includeTax = false;
      setup.spotPrice = 0;
      setup.boxPriceSell = 0;
      setup.packPrice = 0;
    }

    const newLot = {
      id: Date.now(),
      name,
      createdAt: todayDate,
      lotType: nextLotType,
      singlesPurchases: nextLotType === "singles" ? [] : undefined,
      ...setup
    };
    this.lots.push(newLot);
    this.saveLotsToStorage();

    this.currentLotId = newLot.id;
    this.loadLot();
    this.newLotName = "";
    this.newLotType = nextLotType;
    this.showNewLotModal = false;
    this.notify("Lot created", "success");
  },

  openRenameLotModal(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    this.renameLotName = lot.name;
    this.showRenameLotModal = true;
  },

  renameCurrentLot(): void {
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }

    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;

    const nextName = String(this.renameLotName || "").trim();
    if (!nextName) {
      this.notify("Please enter a lot name", "warning");
      return;
    }

    const nextNameKey = nextName.toLocaleLowerCase();
    const hasDuplicate = this.lots.some(
      (candidate) => candidate.id !== lot.id && String(candidate.name || "").trim().toLocaleLowerCase() === nextNameKey
    );
    if (hasDuplicate) {
      this.notify("A lot with this name already exists", "warning");
      return;
    }

    if (lot.name === nextName) {
      this.showRenameLotModal = false;
      return;
    }

    lot.name = nextName;
    this.saveLotsToStorage();
    this.showRenameLotModal = false;
    this.renameLotName = "";

    if (this.currentTab === "portfolio") {
      void this.$nextTick(() => this.initPortfolioChart());
    }

    this.notify("Lot renamed", "success");
  },

  loadLot(): void {
    if (!this.currentLotId) return;

    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    this.showSinglesCsvMapperModal = false;
    this.singlesCsvImportHeaders = [];
    this.singlesCsvImportRows = [];
    this.singlesCsvMapItem = null;
    this.singlesCsvMapCardNumber = null;
    this.singlesCsvMapCost = null;
    this.singlesCsvMapQuantity = null;
    this.singlesCsvMapMarketValue = null;
    this.newLotType = lot.lotType === "singles" ? "singles" : "bulk";
    const todayDate = getTodayDate();

    this.boxPriceCost = lot.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE;
    this.boxesPurchased = lot.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED;
    this.packsPerBox = lot.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX;
    this.spotsPerBox = lot.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX;
    this.costInputMode = lot.costInputMode ?? "perBox";
    this.currency = lot.currency ?? "CAD";
    this.sellingCurrency = lot.sellingCurrency ?? "CAD";
    this.exchangeRate = lot.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE;
    this.purchaseDate =
      toDateOnly(lot.purchaseDate) ??
      toDateOnly(lot.createdAt) ??
      inferDateFromLotId(lot.id) ??
      todayDate;
    this.purchaseShippingCost = lot.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST;

    const legacyTax = lot.taxRatePercent;
    this.purchaseTaxPercent =
      lot.purchaseTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
    this.sellingTaxPercent =
      lot.sellingTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    this.sellingShippingPerOrder = lot.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER;
    this.includeTax = lot.includeTax ?? true;
    this.spotPrice = lot.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE;
    this.boxPriceSell = lot.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL;
    this.packPrice = lot.packPrice ?? DEFAULT_VALUES.PACK_PRICE;
    this.singlesPurchases = lot.lotType === "singles"
      ? normalizeSinglesPurchaseEntries(lot.singlesPurchases)
      : [];
    const parsedTargetProfit = Number(lot.targetProfitPercent);
    if (!this.hasProAccess) {
      this.targetProfitPercent = 0;
    } else if (Number.isFinite(parsedTargetProfit) && parsedTargetProfit >= 0) {
      this.targetProfitPercent = parsedTargetProfit;
    } else {
      this.targetProfitPercent = 15;
    }

    this.syncLivePricesFromDefaults();
    if (lot.lotType === "singles" && this.currentTab === "live") {
      this.currentTab = "config";
    }
    this.loadSalesFromStorage();
    void this.$nextTick(() => {
      if (this.currentTab === "sales") {
        this.initSalesChart();
        return;
      }
      if (this.currentTab === "portfolio") {
        this.initPortfolioChart();
      }
    });
  },

  deleteCurrentLot(): void {
    if (!this.currentLotId) return;
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    const lotIdToDelete = lot.id;
    const linkedSalesCount = this.loadSalesForLotId(lotIdToDelete).length;

    this.askConfirmation(
      {
        title: "Delete Lot?",
        text: linkedSalesCount > 0
          ? `Delete "${lot.name}" and ${linkedSalesCount} linked sale${linkedSalesCount === 1 ? "" : "s"} permanently?`
          : `Delete "${lot.name}" permanently?`,
        color: "error"
      },
      () => {
        this.lots = this.lots.filter((p) => p.id !== lotIdToDelete);
        removeStorageWithLegacy(
          this.getSalesStorageKey(lotIdToDelete),
          getLegacySalesStorageKey(lotIdToDelete)
        );
        if (Number(readStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID)) === lotIdToDelete) {
          removeStorageWithLegacy(STORAGE_KEYS.LAST_LOT_ID, LEGACY_KEYS.LAST_LOT_ID);
        }
        this.saveLotsToStorage();
        this.currentLotId = null;
        this.notify("Lot deleted", "info");
      }
    );
  }
};

