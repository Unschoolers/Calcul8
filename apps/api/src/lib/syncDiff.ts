export interface SyncPresetState {
  presetId: string;
  preset: unknown;
  sales: unknown[];
}

export interface SyncPresetDiff {
  upsertPresetIds: string[];
  deletePresetIds: string[];
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value);
}

export function calculateSyncPresetDiff(
  existing: SyncPresetState[],
  incoming: SyncPresetState[]
): SyncPresetDiff {
  const existingMap = new Map(existing.map((item) => [item.presetId, item] as const));
  const incomingMap = new Map(incoming.map((item) => [item.presetId, item] as const));

  const upsertPresetIds: string[] = [];
  const deletePresetIds: string[] = [];

  for (const [presetId, incomingItem] of incomingMap.entries()) {
    const existingItem = existingMap.get(presetId);
    if (!existingItem) {
      upsertPresetIds.push(presetId);
      continue;
    }

    const presetChanged = stableSerialize(existingItem.preset) !== stableSerialize(incomingItem.preset);
    const salesChanged = stableSerialize(existingItem.sales) !== stableSerialize(incomingItem.sales);

    if (presetChanged || salesChanged) {
      upsertPresetIds.push(presetId);
    }
  }

  for (const presetId of existingMap.keys()) {
    if (!incomingMap.has(presetId)) {
      deletePresetIds.push(presetId);
    }
  }

  return {
    upsertPresetIds,
    deletePresetIds
  };
}
