type PortfolioChartView = "breakdown" | "trend" | "sellthrough" | "margin";

export function getNextPortfolioChartView(current: unknown): PortfolioChartView {
  const normalized = String(current || "trend");
  if (normalized === "breakdown") return "trend";
  if (normalized === "trend") return "sellthrough";
  if (normalized === "sellthrough") return "margin";
  return "breakdown";
}

export function getPortfolioChartToggleTitle(next: PortfolioChartView): string {
  if (next === "breakdown") return "Switch to breakdown view";
  if (next === "trend") return "Switch to trend view";
  if (next === "margin") return "Switch to sold profit margin view";
  return "Switch to sell-through view";
}

export function getPortfolioChartToggleIcon(next: PortfolioChartView): string {
  if (next === "breakdown") return "mdi-chart-donut";
  if (next === "trend") return "mdi-chart-line";
  if (next === "margin") return "mdi-percent-outline";
  return "mdi-chart-bar";
}

export function getPortfolioChartSubtitle(current: unknown): string {
  const normalized = String(current || "trend");
  if (normalized === "breakdown") return "Revenue by lot";
  if (normalized === "sellthrough") return "Sell-through over time (%)";
  if (normalized === "margin") return "Sold profit margin by lot (%)";
  return "Cumulative portfolio profit trend";
}

export function getPortfolioChartAriaLabel(current: unknown): string {
  const normalized = String(current || "trend");
  if (normalized === "breakdown") {
    return "Portfolio revenue breakdown chart by lot.";
  }
  if (normalized === "sellthrough") {
    return "Portfolio sell-through percentage over time chart.";
  }
  if (normalized === "margin") {
    return "Portfolio sold profit margin percentage chart by lot.";
  }
  return "Portfolio cumulative profit trend chart.";
}

export function getPortfolioSalesByUserMetricLabel(metric: unknown): string {
  const normalized = String(metric || "revenue");
  if (normalized === "profit") return "Profit";
  if (normalized === "count") return "Sales count";
  return "Revenue";
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
  weeks: Array<{ label: string }> | undefined,
  series: Array<{ values: number[] }> | undefined
): Array<{ label: string; total: number }> {
  const normalizedWeeks = Array.isArray(weeks) ? weeks : [];
  const normalizedSeries = Array.isArray(series) ? series : [];
  return normalizedWeeks
    .map((week, index) => ({
      label: week.label,
      total: normalizedSeries.reduce((sum, row) => sum + (Number(row?.values?.[index]) || 0), 0)
    }))
    .filter((row) => Math.abs(row.total) > 0.000001);
}

export function getPortfolioSalesByUserSubtitle(): string {
  return "Last 8 weeks by recorded seller";
}

export function getPortfolioSalesByUserAriaLabel(metric: unknown): string {
  const normalized = String(metric || "revenue");
  const metricLabel = normalized === "profit"
    ? "profit"
    : normalized === "count"
      ? "sales count"
      : "revenue";
  return `Portfolio sales per user chart for the last 8 weeks by ${metricLabel}.`;
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
