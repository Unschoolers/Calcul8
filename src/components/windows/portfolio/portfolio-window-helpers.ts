type PortfolioChartView = "breakdown" | "trend" | "sellthrough" | "margin";
type PortfolioCopyFn = (key: string, fallback: string) => string;

type PortfolioPulseRow = {
  lotId?: number;
  lotName?: string;
  salesCount?: number;
  realizedProfit?: number;
  totalProfit?: number;
  soldPacks?: number;
  totalPacks?: number;
};

export type PortfolioPulseInsight = {
  kind: "risk" | "winner" | "next_move";
  lotId: number;
  lotName: string;
  amount: number | null;
  tone: "positive" | "negative" | "warning" | "neutral";
  icon: string;
};

function resolvePortfolioCopy(
  translate: PortfolioCopyFn | undefined,
  key: string,
  fallback: string
): string {
  if (typeof translate !== "function") {
    return fallback;
  }
  try {
    const value = translate(key, fallback);
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function getNextPortfolioChartView(current: unknown): PortfolioChartView {
  const normalized = String(current || "trend");
  if (normalized === "breakdown") return "trend";
  if (normalized === "trend") return "sellthrough";
  if (normalized === "sellthrough") return "margin";
  return "breakdown";
}

export function getPortfolioChartToggleTitle(next: PortfolioChartView, translate?: PortfolioCopyFn): string {
  if (next === "breakdown") {
    return resolvePortfolioCopy(translate, "portfolioChartToggleBreakdownTitle", "Show breakdown view");
  }
  if (next === "trend") {
    return resolvePortfolioCopy(translate, "portfolioChartToggleTrendTitle", "Show trend view");
  }
  if (next === "margin") {
    return resolvePortfolioCopy(translate, "portfolioChartToggleMarginTitle", "Show sold margin view");
  }
  return resolvePortfolioCopy(translate, "portfolioChartToggleSellThroughTitle", "Show sell-through view");
}

export function getPortfolioChartToggleIcon(next: PortfolioChartView): string {
  if (next === "breakdown") return "mdi-chart-donut";
  if (next === "trend") return "mdi-chart-line";
  if (next === "margin") return "mdi-percent-outline";
  return "mdi-chart-bar";
}

export function getPortfolioChartSubtitle(current: unknown, translate?: PortfolioCopyFn): string {
  const normalized = String(current || "trend");
  if (normalized === "breakdown") {
    return resolvePortfolioCopy(translate, "portfolioChartBreakdownSubtitle", "Revenue by lot");
  }
  if (normalized === "sellthrough") {
    return resolvePortfolioCopy(translate, "portfolioChartSellThroughSubtitle", "Sell-through over time");
  }
  if (normalized === "margin") {
    return resolvePortfolioCopy(translate, "portfolioChartMarginSubtitle", "Sold margin by lot");
  }
  return resolvePortfolioCopy(translate, "portfolioChartTrendSubtitle", "Profit trend over time");
}

export function getPortfolioChartAriaLabel(current: unknown, translate?: PortfolioCopyFn): string {
  const normalized = String(current || "trend");
  if (normalized === "breakdown") {
    return resolvePortfolioCopy(translate, "portfolioChartBreakdownAriaLabel", "Portfolio revenue breakdown chart by lot.");
  }
  if (normalized === "sellthrough") {
    return resolvePortfolioCopy(translate, "portfolioChartSellThroughAriaLabel", "Portfolio sell-through over time chart.");
  }
  if (normalized === "margin") {
    return resolvePortfolioCopy(translate, "portfolioChartMarginAriaLabel", "Portfolio sold margin chart by lot.");
  }
  return resolvePortfolioCopy(translate, "portfolioChartTrendAriaLabel", "Portfolio profit trend chart.");
}

export function getPortfolioSalesByUserMetricLabel(metric: unknown, translate?: PortfolioCopyFn): string {
  const normalized = String(metric || "revenue");
  if (normalized === "profit") {
    return resolvePortfolioCopy(translate, "portfolioSalesByUserMetricProfitLabel", "Profit");
  }
  if (normalized === "count") {
    return resolvePortfolioCopy(translate, "portfolioSalesByUserMetricCountLabel", "Count");
  }
  return resolvePortfolioCopy(translate, "portfolioSalesByUserMetricRevenueLabel", "Revenue");
}

export function getPortfolioSalesByUserTotalValue(
  series: Array<{ total?: number }> | undefined
): number {
  return Array.isArray(series)
    ? series.reduce((sum, row) => sum + (Number(row?.total) || 0), 0)
    : 0;
}

export function getPortfolioSalesByUserLeader<T extends { key: string; label: string; color: string; total: number }>(
  series: T[] | undefined
): T | null {
  return Array.isArray(series) ? (series[0] ?? null) : null;
}

export function getPortfolioSalesByUserBestWeek(
  weeks: Array<{ label: string }> | undefined,
  series: Array<{ values: number[] }> | undefined
): { label: string; total: number } | null {
  const normalizedWeeks = Array.isArray(weeks) ? weeks : [];
  const normalizedSeries = Array.isArray(series) ? series : [];
  let bestIndex = -1;
  let bestTotal = 0;

  for (let weekIndex = 0; weekIndex < normalizedWeeks.length; weekIndex += 1) {
    const total = normalizedSeries.reduce((sum, row) => sum + (Number(row?.values?.[weekIndex]) || 0), 0);
    if (Math.abs(total) > Math.abs(bestTotal)) {
      bestTotal = total;
      bestIndex = weekIndex;
    }
  }

  if (bestIndex < 0 || !normalizedWeeks[bestIndex]) {
    return null;
  }

  return {
    label: normalizedWeeks[bestIndex].label,
    total: bestTotal
  };
}

export function getPortfolioSalesByUserWeekTotals(
  weeks: Array<{ key?: string; label: string }> | undefined,
  series: Array<{ values: number[] }> | undefined
): Array<{ key: string; label: string; total: number }> {
  const normalizedWeeks = Array.isArray(weeks) ? weeks : [];
  const normalizedSeries = Array.isArray(series) ? series : [];
  return normalizedWeeks
    .map((week, index) => ({
      key: String(week.key || week.label || ""),
      label: week.label,
      total: normalizedSeries.reduce((sum, row) => sum + (Number(row?.values?.[index]) || 0), 0)
    }))
    .filter((row) => Math.abs(row.total) > 0.000001);
}

export function getPortfolioSalesByUserSubtitle(translate?: PortfolioCopyFn): string {
  return resolvePortfolioCopy(translate, "portfolioSalesByUserSubtitle", "Last 8 weeks by seller");
}

export function getPortfolioSalesByUserAriaLabel(metric: unknown, translate?: PortfolioCopyFn): string {
  const normalized = String(metric || "revenue");
  const metricLabel = normalized === "profit"
    ? resolvePortfolioCopy(translate, "portfolioSalesByUserMetricProfitLabel", "profit")
    : normalized === "count"
      ? resolvePortfolioCopy(translate, "portfolioSalesByUserMetricCountLabel", "count")
      : resolvePortfolioCopy(translate, "portfolioSalesByUserMetricRevenueLabel", "revenue");
  return resolvePortfolioCopy(
    translate,
    "portfolioSalesByUserAriaLabel",
    `Portfolio sales by person chart for the last 8 weeks by ${metricLabel}.`
  ).replace(/\{\{metricLabel\}\}/g, metricLabel);
}

function normalizePulseRows(rows: PortfolioPulseRow[] | undefined): Array<Required<Pick<PortfolioPulseRow, "lotId" | "lotName" | "salesCount" | "totalProfit" | "soldPacks" | "totalPacks">> & { realizedProfit: number }> {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const lotId = Number(row?.lotId);
      const lotName = typeof row?.lotName === "string" ? row.lotName.trim() : "";
      return {
        lotId,
        lotName,
        salesCount: Number(row?.salesCount ?? 0) || 0,
        realizedProfit: Number(row?.realizedProfit ?? row?.totalProfit ?? 0) || 0,
        totalProfit: Number(row?.totalProfit ?? 0) || 0,
        soldPacks: Number(row?.soldPacks ?? 0) || 0,
        totalPacks: Number(row?.totalPacks ?? 0) || 0
      };
    })
    .filter((row) => Number.isFinite(row.lotId) && row.lotId > 0 && row.lotName.length > 0);
}

function hasOpenInventory(row: { soldPacks: number; totalPacks: number }): boolean {
  return row.totalPacks <= 0 || row.soldPacks < row.totalPacks;
}

function roundedMoneyAmount(value: number): number {
  return Math.round(Math.abs(value) * 100) / 100;
}

export function buildPortfolioPulseInsights(rows: PortfolioPulseRow[] | undefined): PortfolioPulseInsight[] {
  const normalizedRows = normalizePulseRows(rows);
  const sellingRiskRows = normalizedRows
    .filter((row) => row.salesCount > 0 && row.totalProfit < 0 && hasOpenInventory(row))
    .sort((left, right) => left.totalProfit - right.totalProfit);
  const riskRows = sellingRiskRows.length > 0
    ? sellingRiskRows
    : normalizedRows
      .filter((row) => row.totalProfit < 0 && hasOpenInventory(row))
      .sort((left, right) => left.totalProfit - right.totalProfit);
  const winnerRows = normalizedRows
    .filter((row) => row.salesCount > 0 && row.realizedProfit > 0)
    .sort((left, right) => right.realizedProfit - left.realizedProfit);

  const insights: PortfolioPulseInsight[] = [];
  const usedLotIds = new Set<number>();
  const biggestRisk = riskRows[0] ?? null;
  const bestWinner = winnerRows[0] ?? null;

  if (biggestRisk) {
    usedLotIds.add(biggestRisk.lotId);
    insights.push({
      kind: "risk",
      lotId: biggestRisk.lotId,
      lotName: biggestRisk.lotName,
      amount: roundedMoneyAmount(biggestRisk.totalProfit),
      tone: "negative",
      icon: "mdi-alert-circle-outline"
    });
  }

  if (bestWinner) {
    usedLotIds.add(bestWinner.lotId);
    insights.push({
      kind: "winner",
      lotId: bestWinner.lotId,
      lotName: bestWinner.lotName,
      amount: roundedMoneyAmount(bestWinner.realizedProfit),
      tone: "positive",
      icon: "mdi-trophy-outline"
    });
  }

  const nextMove = riskRows.find((row) => !usedLotIds.has(row.lotId))
    ?? normalizedRows.find((row) => row.salesCount === 0 && hasOpenInventory(row) && !usedLotIds.has(row.lotId))
    ?? normalizedRows.find((row) => hasOpenInventory(row) && !usedLotIds.has(row.lotId))
    ?? null;

  if (nextMove) {
    insights.push({
      kind: "next_move",
      lotId: nextMove.lotId,
      lotName: nextMove.lotName,
      amount: nextMove.totalProfit < 0 ? roundedMoneyAmount(nextMove.totalProfit) : null,
      tone: nextMove.totalProfit < 0 ? "warning" : "neutral",
      icon: nextMove.salesCount > 0 ? "mdi-arrow-decision-outline" : "mdi-sparkles"
    });
  }

  return insights.slice(0, 3);
}

export function buildPortfolioSalesByUserLegendItems(
  params: {
    series?: Array<{ key: string; label: string; color: string; total: number }>;
    workspaceMembers?: Array<{ userId: string; displayName?: string; photoUrl?: string }>;
    getPresence?: ((member: { userId: string }) => string) | null;
    currentUserPhotoUrl?: string;
  }
): Array<{
  key: string;
  label: string;
  color: string;
  total: number;
  photoUrl: string;
  initials: string;
  presenceState: string;
}> {
  const series = Array.isArray(params.series) ? params.series : [];
  const workspaceMembers = Array.isArray(params.workspaceMembers) ? params.workspaceMembers : [];
  const getPresence = typeof params.getPresence === "function" ? params.getPresence : null;
  const currentUserPhotoUrl = typeof params.currentUserPhotoUrl === "string" ? params.currentUserPhotoUrl : "";

  return series.map((row) => {
    const member = workspaceMembers.find((candidate) => candidate.userId === row.key);
    const photoUrl = row.key === "self" ? currentUserPhotoUrl : (member?.photoUrl || "");
    return {
      ...row,
      photoUrl,
      initials: String(member?.displayName || row.label || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "?",
      presenceState: getPresence && member ? getPresence(member) : "offline"
    };
  });
}
