import type { Sale } from "../../types/app.ts";
import type { SalesEntityContext } from "../context/commerce.ts";
import { getSalesCacheStatusKey } from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";

export type SalesCacheStorageContext = Pick<
  SalesEntityContext,
  "getSalesStorageKey" | "activeScopeType" | "activeWorkspaceId"
>;

export function persistSalesCacheToStorage(
  context: SalesCacheStorageContext,
  lotId: number,
  sales: Sale[]
): void {
  localStorage.setItem(context.getSalesStorageKey(lotId), JSON.stringify(sales));
  localStorage.setItem(
    getSalesCacheStatusKey(lotId, getActiveStorageScope(context)),
    "loaded"
  );
}
