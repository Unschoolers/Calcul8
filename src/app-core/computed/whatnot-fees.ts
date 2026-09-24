import type { CommerceComputedObject } from "../context/commerce.ts";
import { summarizeWhatnotFeePeriod } from "../shared/whatnot-fee-summary.ts";

export const whatnotFeesComputed: Pick<CommerceComputedObject, "whatnotFeeSummary"> = {
  whatnotFeeSummary() {
    // This explicit dependency invalidates the summary after scoped cache hydration.
    void this.salesCacheEpoch;
    const lots = this.lots || [];
    const lotIds = lots.map((lot) => lot.id);
    const salesByLotId = typeof this.getAllSalesByLotId === "function"
      ? this.getAllSalesByLotId(lotIds)
      : new Map<number, typeof this.sales>();
    if (this.currentLotId && salesByLotId.has(this.currentLotId)) {
      salesByLotId.set(this.currentLotId, this.sales || []);
    }
    const missingLotIds = typeof this.getSalesCacheEntry === "function"
      ? lotIds.filter((lotId) => this.getSalesCacheEntry(lotId).status !== "loaded")
      : [];
    return summarizeWhatnotFeePeriod({
      lots,
      salesByLotId,
      dateOnly: this.whatnotFeeDateOnly,
      missingLotIds
    });
  }
};
