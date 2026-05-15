import { canUseAuthoritativeSalesLiveApi } from "../../entity-api-shared.ts";
import { cacheAuthoritativeSales, fetchAuthoritativeSales } from "../../lot-sales-api.ts";
import type { WhatnotApp } from "./whatnot-types.ts";

export function getAffectedWhatnotLotIds(rows: WhatnotApp["whatnotReviewRows"]): number[] {
  const lotIds = new Set<number>();
  for (const row of rows) {
    const selectedImportAction = row.selectedImportAction ?? (row.action === "update" ? "update_existing" : row.action === "skip" ? "skip" : "create");
    if (row.skipImport || selectedImportAction === "skip") {
      continue;
    }
    const lotId = Math.max(0, Math.floor(Number(row.selectedLotId) || 0));
    if (lotId > 0) {
      lotIds.add(lotId);
    }
  }
  return [...lotIds];
}

export async function refreshAffectedWhatnotSales(app: WhatnotApp, lotIds: number[]): Promise<void> {
  if (!canUseAuthoritativeSalesLiveApi() || lotIds.length === 0) {
    return;
  }

  await Promise.all(lotIds.map(async (lotId) => {
    try {
      const latestSales = await fetchAuthoritativeSales(app, lotId);
      if (!latestSales) {
        return;
      }
      cacheAuthoritativeSales(app, lotId, latestSales);
      if (app.currentLotId === lotId) {
        app.sales = latestSales;
      }
    } catch (error) {
      console.warn("Failed to refresh authoritative sales after Whatnot import", {
        lotId,
        error
      });
    }
  }));
}
