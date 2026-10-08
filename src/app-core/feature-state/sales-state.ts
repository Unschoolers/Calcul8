import { DEFAULT_VALUES } from "../../constants.ts";
import type { AppState, NewSaleDraft } from "../../types/app.ts";

export const SALES_FEATURE_STATE_KEYS = [
  "sales", "salesByLotId", "showAddSaleModal", "editingSale", "newSale", "salesChart", "chartView", "salesCacheEpoch"
] as const satisfies readonly (keyof AppState)[];

export type SalesFeatureState = Pick<AppState, (typeof SALES_FEATURE_STATE_KEYS)[number]>;

function createNewSaleDraft(todayDate: string): NewSaleDraft {
  return {
    type: "pack",
    quantity: null,
    packsCount: null,
    singlesPurchaseEntryId: null,
    singlesItems: [{ lineId: 1, singlesPurchaseEntryId: null, quantity: 1, price: null }],
    price: 0,
    customer: "",
    memo: "",
    buyerShipping: DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
    date: todayDate
  };
}

export function createSalesFeatureState(todayDate: string): SalesFeatureState {
  return {
    sales: [],
    salesByLotId: new Map(),
    showAddSaleModal: false,
    editingSale: null,
    newSale: createNewSaleDraft(todayDate),
    salesChart: null,
    chartView: "sparkline",
    salesCacheEpoch: 0
  };
}

export type ActiveSalesResetContext = Pick<SalesFeatureState, "sales" | "salesChart">;

export function disposeSalesChart(context: Pick<SalesFeatureState, "salesChart">): void {
  const chart = context.salesChart as { destroy?: () => void } | null;
  chart?.destroy?.();
  context.salesChart = null;
}

/** Clear the active-lot view and release its chart when no lot is selected. */
export function resetActiveSales(context: ActiveSalesResetContext): void {
  context.sales = [];
  disposeSalesChart(context);
}
