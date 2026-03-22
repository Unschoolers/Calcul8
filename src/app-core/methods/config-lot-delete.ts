import type { Lot } from "../../types/app.ts";
import { getLegacySalesStorageKey, getScopedLastLotStorageKey, readStorageWithLegacy, removeStorageWithLegacy, STORAGE_KEYS } from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import { getDeleteLotConfirmationText } from "./config-lot-crud.ts";

type LegacyKeys = {
  LAST_LOT_ID: string;
};

export type DeleteLotContext = {
  currentLotId: number | null;
  lots: Lot[];
  activeScopeType: "personal" | "workspace";
  activeWorkspaceId: string | null;
  loadSalesForLotId(lotId: number): Array<unknown>;
  saveLotsToStorage(): void;
  getSalesStorageKey(lotId: number): string;
  askConfirmation(
    payload: { title: string; text: string; color?: string },
    action: () => void
  ): void;
  notify(message: string, color?: string): void;
  pushCloudSync(force?: boolean, options?: { allowEmptyOverwrite?: boolean }): Promise<unknown> | void;
};

export function deleteCurrentLotWithPersistence(
  context: DeleteLotContext,
  deps: {
    readStorage: typeof readStorageWithLegacy;
    removeStorage: typeof removeStorageWithLegacy;
    getLegacySalesKey: typeof getLegacySalesStorageKey;
    getLastLotStorageKey: typeof getScopedLastLotStorageKey;
    getStorageScope: typeof getActiveStorageScope;
    legacyKeys: LegacyKeys;
  } = {
    readStorage: readStorageWithLegacy,
    removeStorage: removeStorageWithLegacy,
    getLegacySalesKey: getLegacySalesStorageKey,
    getLastLotStorageKey: getScopedLastLotStorageKey,
    getStorageScope: getActiveStorageScope,
    legacyKeys: { LAST_LOT_ID: STORAGE_KEYS.LAST_LOT_ID }
  }
): void {
  if (!context.currentLotId) return;
  const lot = context.lots.find((entry) => entry.id === context.currentLotId);
  if (!lot) return;

  const lotIdToDelete = lot.id;
  const linkedSalesCount = context.loadSalesForLotId(lotIdToDelete).length;

  context.askConfirmation(
    {
      title: "Delete Lot?",
      text: getDeleteLotConfirmationText(lot.name, linkedSalesCount),
      color: "error"
    },
    () => {
      context.lots = context.lots.filter((entry) => entry.id !== lotIdToDelete);
      deps.removeStorage(
        context.getSalesStorageKey(lotIdToDelete),
        deps.getLegacySalesKey(lotIdToDelete)
      );
      const lastLotStorageKey = deps.getLastLotStorageKey(deps.getStorageScope(context as never));
      const storedLastLotId = context.activeScopeType === "workspace" && context.activeWorkspaceId
        ? localStorage.getItem(lastLotStorageKey)
        : deps.readStorage(STORAGE_KEYS.LAST_LOT_ID, deps.legacyKeys.LAST_LOT_ID);
      if (Number(storedLastLotId) === lotIdToDelete) {
        deps.removeStorage(
          lastLotStorageKey,
          context.activeScopeType === "workspace" && context.activeWorkspaceId ? undefined : deps.legacyKeys.LAST_LOT_ID
        );
      }
      context.saveLotsToStorage();
      context.currentLotId = null;
      context.notify("Lot deleted", "info");
      void context.pushCloudSync(true, {
        allowEmptyOverwrite: context.lots.length === 0
      });
    }
  );
}
