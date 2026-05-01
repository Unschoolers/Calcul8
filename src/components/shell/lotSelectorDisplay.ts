export type LotSelectorDisplayItem = {
  title: string;
  subtitle: string;
  symbolIcon: string;
  completionIcon: string;
  groupLabel: string;
  lotType: string;
};

const EMPTY_LOT_SELECTOR_DISPLAY_ITEM: LotSelectorDisplayItem = {
  title: "",
  subtitle: "",
  symbolIcon: "",
  completionIcon: "",
  groupLabel: "",
  lotType: ""
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toDisplayString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function resolveSlotRecord(item: unknown): Record<string, unknown> | null {
  if (!isRecord(item)) return null;
  return isRecord(item.raw) ? item.raw : item;
}

export function resolveLotSelectorDisplayItem(item: unknown): LotSelectorDisplayItem {
  const source = resolveSlotRecord(item);
  if (!source) {
    return { ...EMPTY_LOT_SELECTOR_DISPLAY_ITEM };
  }

  return {
    title: toDisplayString(source.title),
    subtitle: toDisplayString(source.subtitle),
    symbolIcon: toDisplayString(source.symbolIcon),
    completionIcon: toDisplayString(source.completionIcon),
    groupLabel: toDisplayString(source.groupLabel),
    lotType: toDisplayString(source.lotType)
  };
}
