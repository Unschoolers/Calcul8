type SlotRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SlotRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasUsableValue(value: unknown): boolean {
  if (value == null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function getSlotSources(item: unknown): SlotRecord[] {
  if (!isRecord(item)) return [];

  const sources: SlotRecord[] = [];
  if (isRecord(item.raw)) {
    sources.push(item.raw);
  }
  sources.push(item);
  if (isRecord(item.props)) {
    sources.push(item.props);
  }
  return sources;
}

export function resolveVuetifySlotValue(item: unknown, keys: readonly string[]): unknown {
  const sources = getSlotSources(item);
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (hasUsableValue(value)) {
        return value;
      }
    }
  }
  return undefined;
}

export function resolveVuetifySlotString(item: unknown, keys: readonly string[], fallback = ""): string {
  const value = resolveVuetifySlotValue(item, keys);
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function resolveVuetifySlotNumber(item: unknown, keys: readonly string[]): number | null {
  const value = resolveVuetifySlotValue(item, keys);
  if (value == null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}
