const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDate(): string {
  return formatLocalDate(new Date());
}

export function toDateOnly(value: unknown): string | null {
  if (typeof value === "string" && DATE_ONLY_REGEX.test(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalDate(date);
}

export function inferDateFromTimestampId(value: unknown): string | null {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > 4102444800000) {
    return null;
  }
  return formatUtcDate(new Date(timestamp));
}

export function resolveLotBusinessDate(params: {
  purchaseDate?: unknown;
  createdAt?: unknown;
  lotId?: unknown;
  fallbackDate?: string | null;
}): string | null {
  return (
    toDateOnly(params.purchaseDate) ??
    toDateOnly(params.createdAt) ??
    inferDateFromTimestampId(params.lotId) ??
    toDateOnly(params.fallbackDate)
  );
}

export function resolveLotCreatedDate(params: {
  createdAt?: unknown;
  purchaseDate?: unknown;
  lotId?: unknown;
  fallbackDate?: string | null;
}): string | null {
  return (
    toDateOnly(params.createdAt) ??
    toDateOnly(params.purchaseDate) ??
    inferDateFromTimestampId(params.lotId) ??
    toDateOnly(params.fallbackDate)
  );
}
