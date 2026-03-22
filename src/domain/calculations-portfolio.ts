import { getTodayDate, resolveLotBusinessDate, toDateOnly } from "../shared/lot-dates.ts";
import type { Lot, Sale } from "../types/app.ts";
import { calculateNetFromGross, getGrossRevenueForSale } from "./calculations-fees.ts";

export type PortfolioSellThroughPoint = {
  date: string;
  label: string;
  availableUnits: number;
  soldUnits: number;
  percentage: number;
};

export function getEarliestSaleDate(sales: Array<Pick<Sale, "date">>): string | null {
  let earliest: string | null = null;
  for (const sale of sales) {
    const dateKey = toDateOnly(sale.date);
    if (!dateKey) continue;
    if (!earliest || dateKey < earliest) {
      earliest = dateKey;
    }
  }
  return earliest;
}

export function resolvePortfolioLotStartDate(
  lot: Pick<Lot, "id" | "purchaseDate" | "createdAt">,
  sales: Array<Pick<Sale, "date">>,
  todayDate: string
): string {
  return (
    resolveLotBusinessDate({
      purchaseDate: lot.purchaseDate,
      createdAt: lot.createdAt,
      lotId: lot.id
    }) ??
    getEarliestSaleDate(sales) ??
    todayDate
  );
}

function sortSalesByDateAsc(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function calculateSparklineData(sales: Sale[], totalCaseCost: number, sellingTaxPercent: number): number[] {
  const sortedSales = sortSalesByDateAsc(sales);
  let cumulativeProfit = -totalCaseCost;
  const data = [cumulativeProfit];

  sortedSales.forEach((sale) => {
    const grossRevenue = getGrossRevenueForSale(sale);
    const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, sale.buyerShipping || 0, 1);
    cumulativeProfit += netRevenue;
    data.push(cumulativeProfit);
  });

  const minValue = Math.min(...data);
  return data.map((val) => val - minValue);
}

export function calculateSparklineGradient(sales: Sale[], totalCaseCost: number, sellingTaxPercent: number): string[] {
  const sortedSales = sortSalesByDateAsc(sales);
  let cumulativeProfit = -totalCaseCost;

  sortedSales.forEach((sale) => {
    const grossRevenue = getGrossRevenueForSale(sale);
    const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, sale.buyerShipping || 0, 1);
    cumulativeProfit += netRevenue;
  });

  const finalProfit = cumulativeProfit || -totalCaseCost;
  if (finalProfit < -100) return ["#FF3B30", "#FF6B6B"];
  if (finalProfit < 100) return ["#FFB800", "#FFA000"];
  return ["#34C759", "#4CD964"];
}

export function calculatePortfolioSellThroughTimeline(params: {
  lots: Array<Pick<Lot, "id" | "purchaseDate" | "createdAt">>;
  allLotPerformance: Array<Pick<{ lotId: number; totalPacks: number }, "lotId" | "totalPacks">>;
  salesByLotId: Map<number, Array<Pick<Sale, "date" | "packsCount">>>;
  todayDate?: string;
}): PortfolioSellThroughPoint[] {
  const performanceByLotId = new Map(
    params.allLotPerformance.map((row) => [row.lotId, row] as const)
  );
  const inventoryAddedByDate = new Map<string, number>();
  const soldByDate = new Map<string, number>();
  const fallbackToday = toDateOnly(params.todayDate) ?? getTodayDate();

  for (const lot of params.lots) {
    const sales = params.salesByLotId.get(lot.id) ?? [];
    const totalPacks = Math.max(0, Number(performanceByLotId.get(lot.id)?.totalPacks) || 0);
    if (totalPacks > 0) {
      const startDate = resolvePortfolioLotStartDate(lot, sales, fallbackToday);
      inventoryAddedByDate.set(startDate, (inventoryAddedByDate.get(startDate) ?? 0) + totalPacks);
    }

    for (const sale of sales) {
      const saleDate = toDateOnly(sale.date);
      if (!saleDate) continue;
      const soldUnits = Math.max(0, Number(sale.packsCount) || 0);
      if (soldUnits <= 0) continue;
      soldByDate.set(saleDate, (soldByDate.get(saleDate) ?? 0) + soldUnits);
    }
  }

  const sortedDates = [...new Set([...inventoryAddedByDate.keys(), ...soldByDate.keys()])].sort();
  if (sortedDates.length === 0) return [];

  const timeline: PortfolioSellThroughPoint[] = [];
  let availableUnits = 0;
  let soldUnits = 0;

  for (const date of sortedDates) {
    availableUnits += inventoryAddedByDate.get(date) ?? 0;
    soldUnits += soldByDate.get(date) ?? 0;
    timeline.push({
      date,
      label: date,
      availableUnits,
      soldUnits,
      percentage: availableUnits > 0 ? (soldUnits / availableUnits) * 100 : 0
    });
  }

  let firstMeaningfulIndex = timeline.findIndex((point) => point.soldUnits > 0 || point.percentage > 0);
  if (firstMeaningfulIndex < 0) firstMeaningfulIndex = 0;
  return timeline.slice(firstMeaningfulIndex);
}
