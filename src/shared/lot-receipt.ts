/** Validate a receipt estimate without treating a passed date as a delivery. */
export function normalizeExpectedReceiptDate(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new RangeError("Expected a receipt date in YYYY-MM-DD format.");
  const normalized = value.trim();
  if (!normalized) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return normalized;
    }
  }
  throw new RangeError("Expected a valid receipt date in YYYY-MM-DD format.");
}

export function isLotAwaitingReceipt(lot: { expectedReceiptDate?: string | null }): boolean {
  return typeof lot.expectedReceiptDate === "string" && lot.expectedReceiptDate.trim().length > 0;
}
