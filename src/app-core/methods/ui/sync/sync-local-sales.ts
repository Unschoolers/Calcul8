import type { SyncServiceContext } from "../../../context/sync.ts";

// Sales are intentionally absent from the metadata sync payload, but a legacy
// pull may still replace them. Capture all local views before dispatch.
export function getLocalSalesSignature(app: SyncServiceContext): string {
  return JSON.stringify({
    currentLotId: app.currentLotId,
    sales: app.sales,
    stored: app.lots.map((lot) => [lot.id, app.loadSalesForLotId(lot.id)]),
    cached: app.salesByLotId ? Array.from(app.salesByLotId.entries()) : []
  });
}
