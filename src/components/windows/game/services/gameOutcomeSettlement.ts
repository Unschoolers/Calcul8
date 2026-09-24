import { captureWorkspaceScopeGuard, type ScopeState } from "../../../../app-core/workspace-scope.ts";
import type { Lot, Sale, WheelConfig, PendingWheelInventoryIssue } from "../../../../types/app.ts";
import type { WhatnotFeePeriodSummary } from "../../../../app-core/shared/whatnot-fee-summary.ts";
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
  pendingIssue?: PendingWheelInventoryIssue;
  slotIndex?: number;
  slotColor?: string;
  whatnotFeeSummary?: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null;
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
  if (!input.pendingIssue?.pendingSale && (input.deductionType === "none" || input.packsCount <= 0)) return null;
  const lot = input.lots.find((entry) => entry.id === input.lotId);
  const now = ports.now();
  const sale: Sale = input.pendingIssue?.pendingSale ?? {
    id: ports.nextId(input.spinNumber),
    type: "wheel",
    quantity: input.deductionType === "singles" ? 1 : (input.packsCount || 1),
    packsCount: input.packsCount,
    price: input.config.spinPrice,
    priceIsTotal: true,
    buyerShipping: lot?.sellingShippingPerOrder ?? 0,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    memo: input.spinNumber ? `Wheel spin #${input.spinNumber}: ${input.label}` : `Wheel spin: ${input.label}`,
    linkedWheelId: input.config.id,
    winningTierId: input.tierId,
    costOfWinningTier: input.cost,
    netRevenue: calculateWheelSaleNetRevenue(input.config, lot, input.whatnotFeeSummary),
    wasWhatnotSale: lot?.feeProfilePreset === "whatnot",
    ...(input.singlesEntryId != null ? { singlesPurchaseEntryId: input.singlesEntryId } : {})
  };
  try {
    if (await ports.recordSale(input.pendingIssue?.pendingSaleLotId ?? input.lotId, sale) === false) return null;
  } catch {
    return null;
  }
  return sale;
}

export async function settleSessionGameOutcomeSale(
  input: GameOutcomeSaleInput,
  recorder: {
    addWheelSaleToLot?(lotId: number, sale: Sale): boolean | void | Promise<boolean | void>;
    wheelPendingInventoryIssues?: PendingWheelInventoryIssue[];
    wheelTotalSpins?: number;
    saveWheelSession?(options?: { strict?: boolean }): void;
  },
  revenue: { wheelSessionNetRevenue: number | null },
  isCurrent: () => boolean = () => true
): Promise<Sale | null> {
  if (!recorder.addWheelSaleToLot) return null;
  const spinNumber = input.spinNumber ?? recorder.wheelTotalSpins ?? 0;
  const issues = recorder.wheelPendingInventoryIssues ?? [];
  const issue = input.pendingIssue ?? issues.find(entry =>
    entry.pendingSale?.linkedWheelId === input.config.id
    && entry.slotTier === input.tierId && entry.spinNumber === spinNumber
  ) ?? {
    slotName: input.label, slotColor: input.slotColor ?? "", slotCost: input.cost,
    slotTier: input.tierId, slotPacksCount: input.packsCount, slotDeductionType: input.deductionType,
    slotIndex: input.slotIndex ?? 0, selectedLotId: input.lotId, spinNumber,
    slotSinglesId: input.singlesEntryId
  };
  const sale = await settleGameOutcomeSale({ ...input, pendingIssue: issue }, {
    now: () => new Date(),
    nextId: () => {
      const random = crypto.getRandomValues(new Uint32Array(2));
      return (random[0]! & 0x1fffff) * 0x100000000 + random[1]! || 1;
    },
    recordSale: async (lotId, value) => {
      issue.pendingSale = value;
      issue.pendingSaleLotId = lotId;
      issue.selectedLotId = lotId;
      if (!issues.includes(issue)) issues.push(issue);
      recorder.wheelPendingInventoryIssues = issues;
      // Do not send a write unless its retry identity survives a reload.
      recorder.saveWheelSession?.({ strict: true });
      return recorder.addWheelSaleToLot!(lotId, value);
    }
  });
  if (!isCurrent()) return null;
  const netRevenue = Number(sale?.netRevenue);
  if (sale && Number.isFinite(netRevenue))
    revenue.wheelSessionNetRevenue = (Number(revenue.wheelSessionNetRevenue) || 0) + Math.max(0, netRevenue);
  if (sale && !input.pendingIssue) {
    recorder.wheelPendingInventoryIssues = (recorder.wheelPendingInventoryIssues ?? [])
      .filter(entry => entry.pendingSale?.id !== sale.id);
    recorder.saveWheelSession?.();
  }
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
