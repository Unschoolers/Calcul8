function isValidCsvColumnIndex(value: unknown, headersLength: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < headersLength;
}

export const singlesImportComputed = {
  csvColumnOptions(this: any): Array<{ title: string; value: number }> {
    const headers = Array.isArray(this.singlesCsvImportHeaders) ? this.singlesCsvImportHeaders : [];
    return headers.map((header: string, index: number) => ({
      title: String(header || `Column ${index + 1}`),
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

    addLabel(this.singlesCsvMapItem, "Item");
    addLabel(this.singlesCsvMapQuantity, "Qty");
    addLabel(this.singlesCsvMapCost, "Cost");
    addLabel(this.singlesCsvMapCardNumber, "Number");
    addLabel(this.singlesCsvMapCondition, "Condition");
    addLabel(this.singlesCsvMapLanguage, "Language");
    addLabel(this.singlesCsvMapMarketValue, "Market");

    return Object.fromEntries(
      Object.entries(labelsByColumn).map(([columnIndex, labels]) => [Number(columnIndex), labels.join(" + ")])
    );
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

