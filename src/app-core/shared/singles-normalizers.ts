export function toPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

export function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function normalizeUniquePositiveIntIds(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const normalizedIds: number[] = [];
  const seenIds = new Set<number>();
  for (const value of values) {
    const normalized = toPositiveIntOrNull(value);
    if (normalized == null || seenIds.has(normalized)) continue;
    seenIds.add(normalized);
    normalizedIds.push(normalized);
  }
  return normalizedIds;
}
