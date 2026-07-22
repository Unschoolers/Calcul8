import { useWhatnotDialogPorts } from "./whatnotDialogPorts.ts";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppErrorState from "../../ui/AppErrorState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import type { WhatnotImportReviewRow } from "../../../types/app.ts";
import {
  buildWhatnotCsvImportDraft,
  buildWhatnotWeeklyReportPreflight,
  isValidWhatnotCsvColumnIndex,
  parseWhatnotCsvRowsWithMapping
} from "../../../app-core/shared/whatnot-csv.ts";
import type {
  WhatnotCsvColumnMapping,
  WhatnotWeeklyReportPreflight
} from "../../../app-core/shared/whatnot-csv.ts";

function emptyMapping(): WhatnotCsvColumnMapping {
  return {
    externalSaleId: null,
    externalOrderId: null,
    externalOrderItemId: null,
    externalAccountId: null,
    title: null,
    listingTitle: null,
    buyerName: null,
    orderPlacedAt: null,
    originalItemPrice: null,
    sku: null,
    productCategory: null,
    quantity: null,
    price: null,
    buyerShipping: null,
    date: null,
    orderStatus: null,
    saleType: null,
    packsCount: null
  };
}

function syncMappingState(target: WhatnotCsvColumnMapping, source: WhatnotCsvColumnMapping): void {
  target.externalSaleId = source.externalSaleId;
  target.externalOrderId = source.externalOrderId;
  target.externalOrderItemId = source.externalOrderItemId;
  target.externalAccountId = source.externalAccountId;
  target.title = source.title;
  target.listingTitle = source.listingTitle;
  target.buyerName = source.buyerName;
  target.orderPlacedAt = source.orderPlacedAt;
  target.originalItemPrice = source.originalItemPrice;
  target.sku = source.sku;
  target.productCategory = source.productCategory;
  target.quantity = source.quantity;
  target.price = source.price;
  target.buyerShipping = source.buyerShipping;
  target.date = source.date;
  target.orderStatus = source.orderStatus;
  target.saleType = source.saleType;
  target.packsCount = source.packsCount;
}

const REQUIRED_MAPPING_FIELDS = [
  { key: "whatnotCsvMapOrderId", label: "Order ID" },
  { key: "whatnotCsvMapTitle", label: "Title" },
  { key: "whatnotCsvMapQuantity", label: "Quantity" },
  { key: "whatnotCsvMapPrice", label: "Sale total" },
  { key: "whatnotCsvMapDate", label: "Fallback date" }
] as const;

const OPTIONAL_MAPPING_FIELDS = [
  { key: "whatnotCsvMapExternalSaleId", label: "Ledger / transaction ID" },
  { key: "whatnotCsvMapOrderItemId", label: "Order item ID" },
  { key: "whatnotCsvMapSellerAccountId", label: "Seller ID" },
  { key: "whatnotCsvMapSku", label: "SKU" },
  { key: "whatnotCsvMapBuyerName", label: "Buyer name" },
  { key: "whatnotCsvMapListingTitle", label: "Listing title" },
  { key: "whatnotCsvMapOrderPlacedAt", label: "Order placed at" },
  { key: "whatnotCsvMapOriginalItemPrice", label: "Original item price" },
  { key: "whatnotCsvMapBuyerShipping", label: "Buyer shipping" },
  { key: "whatnotCsvMapOrderStatus", label: "Status / transaction type" }
] as const;

export const WhatnotCsvImportDialog = {
  name: "WhatnotCsvImportDialog",
  components: {
    AppActionButton,
    AppErrorState,
    AppMetricValue
  },
  setup() {
    return useWhatnotDialogPorts();
  },
  computed: {
    whatnotCsvColumnOptions(this: any): Array<{ title: string; value: number }> {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      return headers.map((header: string, index: number) => ({
        title: String(header || `Column ${index + 1}`),
        value: index
      }));
    },

    whatnotCsvRequiredMappingsComplete(this: any): boolean {
      const headersLength = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders.length : 0;
      return isValidWhatnotCsvColumnIndex(this.whatnotCsvMapOrderId, headersLength)
        && isValidWhatnotCsvColumnIndex(this.whatnotCsvMapTitle, headersLength)
        && isValidWhatnotCsvColumnIndex(this.whatnotCsvMapQuantity, headersLength)
        && isValidWhatnotCsvColumnIndex(this.whatnotCsvMapPrice, headersLength)
        && isValidWhatnotCsvColumnIndex(this.whatnotCsvMapDate, headersLength);
    },

    whatnotCsvRequiredMappedCount(this: any): number {
      const headersLength = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders.length : 0;
      return REQUIRED_MAPPING_FIELDS.reduce((count, field) => (
        isValidWhatnotCsvColumnIndex(this[field.key], headersLength) ? count + 1 : count
      ), 0);
    },

    whatnotCsvOptionalMappedCount(this: any): number {
      const headersLength = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders.length : 0;
      return OPTIONAL_MAPPING_FIELDS.reduce((count, field) => (
        isValidWhatnotCsvColumnIndex(this[field.key], headersLength) ? count + 1 : count
      ), 0);
    },

    whatnotCsvPresetReady(this: any): boolean {
      return this.whatnotCsvRequiredMappingsComplete;
    },

    whatnotCsvWeeklyPreflight(this: any): WhatnotWeeklyReportPreflight {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      const rows = Array.isArray(this.whatnotCsvRows) ? this.whatnotCsvRows : [];
      return buildWhatnotWeeklyReportPreflight({
        headers,
        rows,
        mapping: emptyMapping()
      });
    },

    whatnotCsvMappedFieldLabelsByColumn(this: any): Record<number, string[]> {
      const headersLength = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders.length : 0;
      const labelsByColumn: Record<number, string[]> = {};
      for (const field of [...REQUIRED_MAPPING_FIELDS, ...OPTIONAL_MAPPING_FIELDS]) {
        const columnIndex = this[field.key];
        if (!isValidWhatnotCsvColumnIndex(columnIndex, headersLength)) continue;
        if (!labelsByColumn[columnIndex]) {
          labelsByColumn[columnIndex] = [];
        }
        labelsByColumn[columnIndex].push(field.label);
      }
      return labelsByColumn;
    },

    whatnotCsvDetectedDateHeader(this: any): string {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      if (isValidWhatnotCsvColumnIndex(this.whatnotCsvMapOrderPlacedAt, headers.length)) {
        return String(headers[this.whatnotCsvMapOrderPlacedAt] || "Order placed at");
      }
      return isValidWhatnotCsvColumnIndex(this.whatnotCsvMapDate, headers.length)
        ? String(headers[this.whatnotCsvMapDate] || "Fallback date")
        : "Fallback date";
    },

    whatnotCsvDetectedOrderPlacedAtHeader(this: any): string {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      return isValidWhatnotCsvColumnIndex(this.whatnotCsvMapOrderPlacedAt, headers.length)
        ? String(headers[this.whatnotCsvMapOrderPlacedAt] || "Order placed at")
        : "Order placed at";
    },

    whatnotCsvDetectedPriceHeader(this: any): string {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      return isValidWhatnotCsvColumnIndex(this.whatnotCsvMapPrice, headers.length)
        ? String(headers[this.whatnotCsvMapPrice] || "Sale total")
        : "Sale total";
    },

    whatnotCsvDetectedOriginalItemPriceHeader(this: any): string {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      return isValidWhatnotCsvColumnIndex(this.whatnotCsvMapOriginalItemPrice, headers.length)
        ? String(headers[this.whatnotCsvMapOriginalItemPrice] || "Original item price")
        : "Original item price";
    },

    whatnotCsvPreviewColumns(this: any): Array<{ index: number; header: string; label: string }> {
      const headers = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders : [];
      const columns: Array<{ index: number; header: string; label: string }> = [];
      const seen = new Set<number>();
      for (const field of [...REQUIRED_MAPPING_FIELDS, ...OPTIONAL_MAPPING_FIELDS]) {
        const columnIndex = this[field.key];
        if (!isValidWhatnotCsvColumnIndex(columnIndex, headers.length) || seen.has(columnIndex)) {
          continue;
        }
        seen.add(columnIndex);
        columns.push({
          index: columnIndex,
          header: String(headers[columnIndex] || `Column ${columnIndex + 1}`),
          label: field.label
        });
      }
      if (columns.length === 0) {
        return headers.slice(0, 6).map((header: string, index: number) => ({
          index,
          header: String(header || `Column ${index + 1}`),
          label: "CSV column"
        }));
      }
      return columns;
    },

    whatnotCsvParsedPreview(this: any): { readyCount: number; skippedCount: number } | null {
      const headersLength = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders.length : 0;
      if (!this.whatnotCsvRequiredMappingsComplete || headersLength <= 0) {
        return null;
      }

      const mapping: WhatnotCsvColumnMapping = {
        externalSaleId: this.whatnotCsvMapExternalSaleId,
        externalOrderId: this.whatnotCsvMapOrderId,
        externalOrderItemId: this.whatnotCsvMapOrderItemId,
        externalAccountId: this.whatnotCsvMapSellerAccountId,
        title: this.whatnotCsvMapTitle,
        listingTitle: this.whatnotCsvMapListingTitle,
        buyerName: this.whatnotCsvMapBuyerName,
        orderPlacedAt: this.whatnotCsvMapOrderPlacedAt,
        originalItemPrice: this.whatnotCsvMapOriginalItemPrice,
        sku: this.whatnotCsvMapSku,
        productCategory: this.whatnotCsvMapProductCategory,
        quantity: this.whatnotCsvMapQuantity,
        price: this.whatnotCsvMapPrice,
        buyerShipping: this.whatnotCsvMapBuyerShipping,
        date: this.whatnotCsvMapDate,
        orderStatus: this.whatnotCsvMapOrderStatus,
        saleType: null,
        packsCount: null
      };
      const parsed = parseWhatnotCsvRowsWithMapping(
        this.whatnotCsvRows,
        headersLength,
        mapping,
        this.whatnotCsvSellerAccountId
      );
      return {
        readyCount: parsed.entries.length,
        skippedCount: parsed.skippedCount
      };
    }
  },
  methods: {
    closeWhatnotCsvDialog(this: any): void {
      this.closeWhatnotCsvImportDialog();
    },

    whatnotCsvMappedFieldLabel(this: any, columnIndex: number): string {
      return (this.whatnotCsvMappedFieldLabelsByColumn?.[columnIndex] || []).join(" • ");
    },

    isWhatnotCsvColumnMapped(this: any, columnIndex: number): boolean {
      return Array.isArray(this.whatnotCsvMappedFieldLabelsByColumn?.[columnIndex])
        && this.whatnotCsvMappedFieldLabelsByColumn[columnIndex].length > 0;
    },

    async loadWhatnotCsvFile(this: any, files: File | File[] | FileList | null | undefined): Promise<void> {
      const file = files instanceof File
        ? files
        : Array.isArray(files)
          ? files[0]
          : files?.[0];
      if (!file) return;
      this.whatnotCsvRawInput = await file.text();
      this.prepareWhatnotCsvDraft();
      this.notify(`Loaded ${file.name} into the CSV box.`, "success");
    },

    prepareWhatnotCsvDraft(this: any): void {
      const draft = buildWhatnotCsvImportDraft(String(this.whatnotCsvRawInput || ""));
      if (!draft) {
        this.whatnotCsvHeaders = [];
        this.whatnotCsvRows = [];
        this.notify("Could not read a valid Whatnot CSV yet.", "warning");
        return;
      }

      this.whatnotCsvHeaders = draft.headers;
      this.whatnotCsvRows = draft.rows;
      const mapping = emptyMapping();
      syncMappingState(mapping, draft.mapping);
      this.whatnotCsvMapExternalSaleId = mapping.externalSaleId;
      this.whatnotCsvMapOrderId = mapping.externalOrderId;
      this.whatnotCsvMapOrderItemId = mapping.externalOrderItemId;
      this.whatnotCsvMapSellerAccountId = mapping.externalAccountId;
      this.whatnotCsvMapTitle = mapping.title;
      this.whatnotCsvMapListingTitle = mapping.listingTitle;
      this.whatnotCsvMapBuyerName = mapping.buyerName;
      this.whatnotCsvMapOrderPlacedAt = mapping.orderPlacedAt;
      this.whatnotCsvMapOriginalItemPrice = mapping.originalItemPrice;
      this.whatnotCsvMapSku = mapping.sku;
      this.whatnotCsvMapProductCategory = mapping.productCategory;
      this.whatnotCsvMapQuantity = mapping.quantity;
      this.whatnotCsvMapPrice = mapping.price;
      this.whatnotCsvMapBuyerShipping = mapping.buyerShipping;
      this.whatnotCsvMapDate = mapping.date;
      this.whatnotCsvMapOrderStatus = mapping.orderStatus;

      if (!this.whatnotCsvRequiredMappingsComplete) {
        this.notify(
          "This file does not look like a valid Whatnot weekly export yet. Check Advanced mapping only if you know the export is correct.",
          "warning"
        );
      }
    },

    async confirmWhatnotCsvImport(this: any): Promise<void> {
      const headersLength = Array.isArray(this.whatnotCsvHeaders) ? this.whatnotCsvHeaders.length : 0;
      if (!this.whatnotCsvRequiredMappingsComplete || headersLength <= 0) {
        this.notify("Map Order ID, Title, Quantity, Price, and Date before importing.", "warning");
        return;
      }

      const mapping: WhatnotCsvColumnMapping = {
        externalSaleId: this.whatnotCsvMapExternalSaleId,
        externalOrderId: this.whatnotCsvMapOrderId,
        externalOrderItemId: this.whatnotCsvMapOrderItemId,
        externalAccountId: this.whatnotCsvMapSellerAccountId,
        title: this.whatnotCsvMapTitle,
        listingTitle: this.whatnotCsvMapListingTitle,
        buyerName: this.whatnotCsvMapBuyerName,
        orderPlacedAt: this.whatnotCsvMapOrderPlacedAt,
        originalItemPrice: this.whatnotCsvMapOriginalItemPrice,
        sku: this.whatnotCsvMapSku,
        productCategory: this.whatnotCsvMapProductCategory,
        quantity: this.whatnotCsvMapQuantity,
        price: this.whatnotCsvMapPrice,
        buyerShipping: this.whatnotCsvMapBuyerShipping,
        date: this.whatnotCsvMapDate,
        orderStatus: this.whatnotCsvMapOrderStatus,
        saleType: null,
        packsCount: null
      };

      const normalized = parseWhatnotCsvRowsWithMapping(
        this.whatnotCsvRows,
        headersLength,
        mapping,
        this.whatnotCsvSellerAccountId
      );
      if (normalized.entries.length === 0) {
        this.notify("No valid Whatnot rows were found after applying this mapping.", "warning");
        return;
      }

      const prepared = await this.prepareWhatnotCsvImport(
        normalized.entries.map((entry: WhatnotImportReviewRow) => ({
          source: "csv",
          externalOrderId: entry.externalOrderId,
          externalOrderItemId: entry.externalOrderItemId,
          externalSaleId: entry.externalSaleId,
          externalAccountId: entry.externalAccountId || undefined,
          title: entry.title,
          listingTitle: entry.listingTitle,
          sku: entry.sku,
          productCategory: entry.productCategory,
          buyerName: entry.buyerName,
          quantity: entry.quantity,
          price: entry.price,
          originalItemPrice: entry.originalItemPrice,
          buyerShipping: entry.buyerShipping,
          date: entry.date,
          orderPlacedAt: entry.orderPlacedAt,
          orderPlacedAtRaw: entry.orderPlacedAtRaw,
          orderStatus: entry.orderStatus
        })),
        this.whatnotCsvSellerAccountId
      );
      if (!prepared) {
        return;
      }
    }
  }
};
