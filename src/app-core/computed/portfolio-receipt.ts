import { isLotAwaitingReceipt } from "../../shared/lot-receipt.ts";

export interface PortfolioReceiptSummary {
  received: { lotCount: number; totalCost: number };
  awaiting: { lotCount: number; totalCost: number };
  nextExpectedReceiptDate: string | null;
  realizedProfit: number;
  capitalToRecover: number;
}

export interface PortfolioReceiptRow {
  expectedReceiptDate?: string;
  totalCost: number;
  realizedProfit?: number;
  totalRevenue: number;
}

export function buildPortfolioReceiptSummary(rows: PortfolioReceiptRow[], todayDate: string): PortfolioReceiptSummary {
  const summary: PortfolioReceiptSummary = {
    received: { lotCount: 0, totalCost: 0 },
    awaiting: { lotCount: 0, totalCost: 0 },
    nextExpectedReceiptDate: null,
    realizedProfit: 0,
    capitalToRecover: 0
  };
  let totalCost = 0;
  let totalRevenue = 0;
  for (const row of rows) {
    const cost = Number(row.totalCost) || 0;
    totalCost += cost;
    totalRevenue += Number(row.totalRevenue) || 0;
    summary.realizedProfit += Number(row.realizedProfit) || 0;
    if (isLotAwaitingReceipt(row)) {
      summary.awaiting.lotCount += 1;
      summary.awaiting.totalCost += cost;
      const date = String(row.expectedReceiptDate);
      if (date >= todayDate && (summary.nextExpectedReceiptDate == null || date < summary.nextExpectedReceiptDate)) {
        summary.nextExpectedReceiptDate = date;
      }
    } else {
      summary.received.lotCount += 1;
      summary.received.totalCost += cost;
    }
  }
  summary.capitalToRecover = Math.max(0, totalCost - totalRevenue);
  return summary;
}
