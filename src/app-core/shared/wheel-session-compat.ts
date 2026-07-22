import type { PendingWheelInventoryIssue } from "../../types/app.ts";

type WheelPendingInventoryIssueContext = Record<string, unknown> & { wheelPendingInventoryIssues?: PendingWheelInventoryIssue[] };

export function normalizeWheelPendingInventoryIssues(raw: unknown): PendingWheelInventoryIssue[] {
  if (!Array.isArray(raw)) return [];
  return (raw as PendingWheelInventoryIssue[]).map((entry) => {
    const candidateLotIds = Array.isArray(entry.candidateLotIds) ? Array.from(new Set(entry.candidateLotIds
      .map((id) => Math.floor(Number(id))).filter((id) => Number.isFinite(id) && id > 0))) : undefined;
    const rest = { ...entry };
    delete rest.candidateLotIds;
    delete rest.requiresLotSelection;
    return { ...rest, ...(candidateLotIds?.length ? { candidateLotIds } : {}),
      ...(entry.requiresLotSelection === true ? { requiresLotSelection: true } : {}) };
  });
}

export function assignWheelPendingInventoryIssues(
  context: WheelPendingInventoryIssueContext,
  raw: unknown
): PendingWheelInventoryIssue[] {
  const nextIssues = normalizeWheelPendingInventoryIssues(raw);
  context.wheelPendingInventoryIssues = nextIssues;
  return nextIssues;
}
