import type { Lot, LotType } from "../types/app.ts";

export const LOT_TYPES = ["bulk", "singles"] as const satisfies readonly LotType[];

export type LotTypeSource = Pick<Lot, "lotType"> | { lotType?: unknown } | null | undefined;
type PresentLotTypeSource<T extends LotTypeSource> = NonNullable<T> & { lotType?: unknown };

export function normalizeLotType(value: unknown): LotType {
  return value === "singles" ? "singles" : "bulk";
}

export function getLotType(lot?: LotTypeSource): LotType {
  return normalizeLotType(lot?.lotType);
}

export function isSinglesLot<T extends LotTypeSource>(
  lot: T
): lot is PresentLotTypeSource<T> & { lotType: "singles" } {
  return lot != null && getLotType(lot) === "singles";
}

export function isBulkLot<T extends LotTypeSource>(
  lot: T
): lot is PresentLotTypeSource<T> & { lotType?: "bulk" } {
  return lot != null && getLotType(lot) === "bulk";
}
