import { captureWorkspaceScopeGuard, type ScopeState } from "../../../../app-core/workspace-scope.ts";
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
  recordSale(lotId: number, sale: Sale): boolean | void | Promise<boolean | void>;
  now(): Date;
  nextId(spinNumber?: number): number;
};

export async function settleGameOutcomeSale(
  input: GameOutcomeSaleInput,
  ports: GameOutcomeSettlementPorts
): Promise<Sale | null> {
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
  try {
    if (await ports.recordSale(input.lotId, sale) === false) return null;
  } catch {
    return null;
  }
  return sale;
}

export async function settleSessionGameOutcomeSale(
  input: GameOutcomeSaleInput,
  recorder: { addWheelSaleToLot?(lotId: number, sale: Sale): boolean | void | Promise<boolean | void> },
  revenue: { wheelSessionNetRevenue: number | null },
  isCurrent: () => boolean = () => true
): Promise<Sale | null> {
  if (!recorder.addWheelSaleToLot) return null;
  const sale = await settleGameOutcomeSale(input, {
    now: () => new Date(),
    nextId: (spinNumber) => Date.now() + (spinNumber ?? 0),
    recordSale: (lotId, value) => recorder.addWheelSaleToLot?.(lotId, value)
  });
  if (!isCurrent()) return null;
  const netRevenue = Number(sale?.netRevenue);
  if (sale && Number.isFinite(netRevenue))
    revenue.wheelSessionNetRevenue = (Number(revenue.wheelSessionNetRevenue) || 0) + Math.max(0, netRevenue);
  return sale;
}

const settlementRevisions = new WeakMap<object, number>();
type SettlementContext = ScopeState & { googleAuthEpoch: number; activeWheelConfigId: number | null };

export function invalidateGameOutcomeSettlements(context: object): void {
  settlementRevisions.set(context, (settlementRevisions.get(context) ?? 0) + 1);
}

export function captureGameOutcomeGuard(context: SettlementContext): () => boolean {
  const isCurrentScope = captureWorkspaceScopeGuard(context);
  const configId = context.activeWheelConfigId;
  const revision = settlementRevisions.get(context);
  return () => isCurrentScope() && context.activeWheelConfigId === configId
    && settlementRevisions.get(context) === revision;
}
