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
  const existingMap = new Map<string, SyncPresetState>();
  const incomingMap = new Map<string, SyncPresetState>();

  for (const item of existing) {
    existingMap.set(item.presetId, item);
  }
  for (const item of incoming) {
    incomingMap.set(item.presetId, item);
  }

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
