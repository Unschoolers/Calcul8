import type { WheelConfig } from "../../types/app.ts";
import {
  getScopedActiveWheelConfigStorageKey,
  getScopedWheelSessionStorageKey,
  type AppStorageScope
} from "../storageKeys.ts";

function validConfigId(configs: WheelConfig[], value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) && id > 0 && configs.some((config) => config.id === id) ? id : null;
}

/** Restores the scoped selection and upgrades the legacy root-session selection in place. */
export function restoreStoredWheelConfigSelection(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  scope: AppStorageScope,
  configs: WheelConfig[]
): number | null {
  const selectionKey = getScopedActiveWheelConfigStorageKey(scope);
  let selectedId: number | null = null;
  try {
    selectedId = validConfigId(configs, storage.getItem(selectionKey));
    if (selectedId == null) {
      const legacy = JSON.parse(storage.getItem(getScopedWheelSessionStorageKey(scope)) || "null") as { activeWheelConfigId?: unknown } | null;
      selectedId = validConfigId(configs, legacy?.activeWheelConfigId);
    }
    selectedId ??= configs[0]?.id ?? null;
    if (selectedId == null) storage.removeItem(selectionKey);
    else storage.setItem(selectionKey, String(selectedId));
  } catch {
    selectedId = configs[0]?.id ?? null;
  }
  return selectedId;
}
