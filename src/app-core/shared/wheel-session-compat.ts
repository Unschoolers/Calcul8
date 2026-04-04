import type { PendingWheelInventoryIssue } from "../../types/app.ts";

type WheelPendingInventoryIssueContext = Record<string, unknown> & {
  wheelPendingInventoryIssues?: PendingWheelInventoryIssue[];
  wheelSkippedDeductions?: PendingWheelInventoryIssue[];
};

export function normalizeWheelPendingInventoryIssues(raw: unknown): PendingWheelInventoryIssue[] {
  return Array.isArray(raw) ? [...(raw as PendingWheelInventoryIssue[])] : [];
}

export function assignWheelPendingInventoryIssues(
  context: WheelPendingInventoryIssueContext,
  raw: unknown
): PendingWheelInventoryIssue[] {
  const nextIssues = normalizeWheelPendingInventoryIssues(raw);
  context.wheelPendingInventoryIssues = nextIssues;
  context.wheelSkippedDeductions = [...nextIssues];
  return nextIssues;
}
