import type { Lot } from "../../types/app.ts";
import { getSalesCacheStatusKey, getScopedLastLotStorageKey } from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import { getDeleteLotConfirmationText } from "./config-lot-crud.ts";

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
    getLastLotStorageKey: typeof getScopedLastLotStorageKey;
    getStorageScope: typeof getActiveStorageScope;
  } = {
    getLastLotStorageKey: getScopedLastLotStorageKey,
    getStorageScope: getActiveStorageScope
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
      try {
        localStorage.removeItem(context.getSalesStorageKey(lotIdToDelete));
      } catch {
        // Ignore storage failures.
      }
      try {
        localStorage.removeItem(getSalesCacheStatusKey(lotIdToDelete, deps.getStorageScope(context as never)));
      } catch {
        // Ignore storage failures.
      }
      const lastLotStorageKey = deps.getLastLotStorageKey(deps.getStorageScope(context as never));
      const storedLastLotId = localStorage.getItem(lastLotStorageKey);
      if (Number(storedLastLotId) === lotIdToDelete) {
        try {
          localStorage.removeItem(lastLotStorageKey);
        } catch {
          // Ignore storage failures.
        }
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
