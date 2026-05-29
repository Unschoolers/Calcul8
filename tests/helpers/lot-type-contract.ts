import type { Lot, LotType } from "../../src/types/app.ts";
import { LOT_TYPES } from "../../src/app-core/shared/lot-types.ts";
import { makeLot } from "./fixtures.ts";

export type LotTypeContractCase = {
  lotType: LotType;
  lot: Lot;
};

export function createLotTypeContractCases(overrides: Partial<Lot> = {}): LotTypeContractCase[] {
  return LOT_TYPES.map((lotType, index) => {
    const base = makeLot({
      id: index + 1,
      name: lotType === "singles" ? "Contract singles lot" : "Contract bulk lot",
      lotType,
      ...(lotType === "singles"
        ? {
          singlesCatalogSource: "none",
          singlesPurchases: [{
            id: 1001,
            item: "Contract item",
            cost: 4,
            currency: "CAD",
            quantity: 2,
            marketValue: 7,
            marketValueCurrency: "CAD"
          }]
        }
        : {
          singlesCatalogSource: undefined,
          singlesPurchases: undefined
        })
    });
    const lot = {
      ...base,
      ...overrides,
      lotType
    };
    if (lotType === "singles" && !Array.isArray(lot.singlesPurchases)) {
      lot.singlesPurchases = base.singlesPurchases;
    }
    if (lotType === "bulk") {
      lot.singlesCatalogSource = undefined;
      lot.singlesPurchases = undefined;
    }
    return { lotType, lot };
  });
}
