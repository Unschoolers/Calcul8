import type { Lot, Sale, WheelConfig } from "../../../../types/app.ts";
import { calculateWheelSaleNetRevenue } from "./wheelPricing.ts";

export type GameOutcomeSaleInput = {
  config: WheelConfig;
  tierId: string;
  cost: number;
  packsCount: number;
  deductionType: "packs" | "singles" | "none";
  label: string;
  lotId: number;
  lots: Lot[];
  singlesEntryId?: number | null;
  spinNumber?: number;
};

export type GameOutcomeSettlementPorts = {
  recordSale(lotId: number, sale: Sale): void;
  now(): Date;
  nextId(spinNumber?: number): number;
};

export function settleGameOutcomeSale(
  input: GameOutcomeSaleInput,
  ports: GameOutcomeSettlementPorts
): Sale | null {
  if (input.deductionType === "none" || input.packsCount <= 0) return null;
  const lot = input.lots.find((entry) => entry.id === input.lotId);
  const now = ports.now();
  const sale: Sale = {
    id: ports.nextId(input.spinNumber),
    type: "wheel",
    quantity: input.deductionType === "singles" ? 1 : (input.packsCount || 1),
    packsCount: input.packsCount,
    price: input.config.spinPrice,
    buyerShipping: lot?.sellingShippingPerOrder ?? 0,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    memo: input.spinNumber ? `Wheel spin #${input.spinNumber}: ${input.label}` : `Wheel spin: ${input.label}`,
    linkedWheelId: input.config.id,
    winningTierId: input.tierId,
    costOfWinningTier: input.cost,
    netRevenue: calculateWheelSaleNetRevenue(input.config, lot),
    ...(input.singlesEntryId != null ? { singlesPurchaseEntryId: input.singlesEntryId } : {})
  };
  ports.recordSale(input.lotId, sale);
  return sale;
}

export function settleSessionGameOutcomeSale(
  input: GameOutcomeSaleInput,
  recorder: { addWheelSaleToLot?(lotId: number, sale: Sale): void },
  revenue: { sessionNetRevenue: number | null }
): Sale | null {
  const sale = settleGameOutcomeSale(input, {
    now: () => new Date(),
    nextId: (spinNumber) => Date.now() + (spinNumber ?? 0),
    recordSale: (lotId, value) => recorder.addWheelSaleToLot?.(lotId, value)
  });
  const netRevenue = Number(sale?.netRevenue);
  if (sale && Number.isFinite(netRevenue))
    revenue.sessionNetRevenue = (Number(revenue.sessionNetRevenue) || 0) + Math.max(0, netRevenue);
  return sale;
}
