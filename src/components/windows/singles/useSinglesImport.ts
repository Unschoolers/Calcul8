function isValidCsvColumnIndex(value: unknown, headersLength: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < headersLength;
}

type SinglesCsvPreviewColumn = {
  index: number;
  header: string;
  label: string;
};

function translatedImportLabel(
  context: { t?: (key: string, params?: Record<string, string | number | null | undefined>) => string },
  key: string,
  fallback: string,
  params?: Record<string, string | number | null | undefined>
): string {
  const value = typeof context.t === "function" ? context.t(key, params) : "";
  return value && value !== key ? value : fallback;
}

export const singlesImportComputed = {
  csvColumnOptions(this: any): Array<{ title: string; value: number }> {
    const headers = Array.isArray(this.singlesCsvImportHeaders) ? this.singlesCsvImportHeaders : [];
    return headers.map((header: string, index: number) => ({
      title: String(header || translatedImportLabel(this, "singlesCsvColumnLabel", `Column ${index + 1}`, { count: index + 1 })),
      value: index
    }));
  },

  requiredCsvMappedCount(this: any): number {
    const headersLength = Array.isArray(this.singlesCsvImportHeaders) ? this.singlesCsvImportHeaders.length : 0;
    let count = 0;
    if (isValidCsvColumnIndex(this.singlesCsvMapItem, headersLength)) count += 1;
    if (isValidCsvColumnIndex(this.singlesCsvMapQuantity, headersLength)) count += 1;
    return count;
  },

  optionalCsvMappedCount(this: any): number {
    const headersLength = Array.isArray(this.singlesCsvImportHeaders) ? this.singlesCsvImportHeaders.length : 0;
    let count = 0;
    if (isValidCsvColumnIndex(this.singlesCsvMapCost, headersLength)) count += 1;
    if (isValidCsvColumnIndex(this.singlesCsvMapCardNumber, headersLength)) count += 1;
    if (isValidCsvColumnIndex(this.singlesCsvMapCondition, headersLength)) count += 1;
    if (isValidCsvColumnIndex(this.singlesCsvMapLanguage, headersLength)) count += 1;
    if (isValidCsvColumnIndex(this.singlesCsvMapMarketValue, headersLength)) count += 1;
    return count;
  },

  requiredCsvMappingsComplete(this: any): boolean {
    return this.requiredCsvMappedCount >= 2;
  },

  csvMappedFieldLabelsByColumn(this: any): Record<number, string> {
    const headersLength = Array.isArray(this.singlesCsvImportHeaders) ? this.singlesCsvImportHeaders.length : 0;
    const labelsByColumn: Record<number, string[]> = {};
    const addLabel = (columnIndex: unknown, label: string): void => {
      if (!isValidCsvColumnIndex(columnIndex, headersLength)) return;
      if (!labelsByColumn[columnIndex]) {
        labelsByColumn[columnIndex] = [];
      }
      labelsByColumn[columnIndex].push(label);
    };

    addLabel(this.singlesCsvMapItem, translatedImportLabel(this, "singlesTableItemLabel", "Item"));
    addLabel(this.singlesCsvMapQuantity, translatedImportLabel(this, "singlesEditorQuantityLabel", "Qty"));
    addLabel(this.singlesCsvMapCost, translatedImportLabel(this, "singlesEditorCostLabel", "Cost"));
    addLabel(this.singlesCsvMapCardNumber, translatedImportLabel(this, "singlesTableNumberLabel", "Number"));
    addLabel(this.singlesCsvMapCondition, translatedImportLabel(this, "singlesTableConditionLabel", "Condition"));
    addLabel(this.singlesCsvMapLanguage, translatedImportLabel(this, "singlesTableLanguageLabel", "Language"));
    addLabel(this.singlesCsvMapMarketValue, translatedImportLabel(this, "singlesCsvMarketValueLabel", "Market"));

    return Object.fromEntries(
      Object.entries(labelsByColumn).map(([columnIndex, labels]) => [Number(columnIndex), labels.join(" + ")])
    );
  },

  singlesCsvPreviewColumns(this: any): SinglesCsvPreviewColumn[] {
    const headers = Array.isArray(this.singlesCsvImportHeaders) ? this.singlesCsvImportHeaders : [];
    const labelsByColumn = this.csvMappedFieldLabelsByColumn as Record<number, string>;
    const mappedColumns: SinglesCsvPreviewColumn[] = headers
      .map((header: string, index: number) => ({
        index,
        header: String(header || translatedImportLabel(this, "singlesCsvColumnLabel", `Column ${index + 1}`, { count: index + 1 })),
        label: String(labelsByColumn?.[index] || "")
      }))
      .filter((column: SinglesCsvPreviewColumn) => column.label.length > 0);

    if (mappedColumns.length > 0) {
      return mappedColumns;
    }

    return headers.slice(0, 6).map((header: string, index: number) => ({
      index,
      header: String(header || translatedImportLabel(this, "singlesCsvColumnLabel", `Column ${index + 1}`, { count: index + 1 })),
      label: "CSV"
    }));
  }
};

export const singlesImportMethods = {
  csvMappedFieldLabel(this: any, columnIndex: number): string {
    const labelsByColumn = this.csvMappedFieldLabelsByColumn as Record<number, string>;
    return String(labelsByColumn?.[columnIndex] || "");
  },

  isCsvColumnMapped(this: any, columnIndex: number): boolean {
    return this.csvMappedFieldLabel(columnIndex).length > 0;
  }
};
