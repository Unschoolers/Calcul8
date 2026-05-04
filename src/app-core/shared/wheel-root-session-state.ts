import type { MysteryGridReveal, PendingWheelInventoryIssue, WheelFairnessEntry } from "../../types/app.ts";
import { assignWheelPendingInventoryIssues } from "./wheel-session-compat.ts";

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };

export type RootWheelSessionStateContext = {
  wheelTotalSpins: number;
  wheelSpinCounts: number[];
  wheelLastResult: string;
  wheelSessionUpdatedAt: number;
  wheelSessionLotSelections: Record<string, number | null>;
  wheelPendingInventoryIssues: PendingWheelInventoryIssue[];
  wheelSkippedDeductions: PendingWheelInventoryIssue[];
  wheelCurrentAngle: number;
  wheelSessionNetRevenue: number | null;
  wheelSessionCostAdjustment: number;
  wheelFairnessHistory: WheelFairnessEntry[];
  wheelChaseTallyHistory: WheelTallyHistoryEntry[];
  wheelGridLayoutSeed: string;
  wheelPreviewGridLayoutSeed: string;
  wheelGridReveals: MysteryGridReveal[];
  wheelPreviewGridReveals: MysteryGridReveal[];
  wheelPreviewSpinCounts: number[];
  wheelPreviewTotalSpins: number;
  wheelPreviewFairnessHistory: WheelFairnessEntry[];
  wheelPreviewChaseTallyHistory: WheelTallyHistoryEntry[];
  wheelLastResultColor: string;
  wheelSpinHash: string;
  wheelSpinSeed: string;
  wheelSpinClientSeed: string;
  wheelSpinVerificationUrl: string;
  wheelSpinAlgorithm: string;
};

const DEFAULT_WHEEL_LAST_RESULT_COLOR = "rgb(var(--v-theme-primary))";

function limitFairnessHistory(entries: unknown): WheelFairnessEntry[] {
  return Array.isArray(entries) ? (entries.slice(-20) as WheelFairnessEntry[]) : [];
}

function normalizeTallyHistory(entries: unknown): WheelTallyHistoryEntry[] {
  return Array.isArray(entries) ? (entries as WheelTallyHistoryEntry[]) : [];
}

export function resetRootWheelSessionState(context: RootWheelSessionStateContext): void {
  context.wheelTotalSpins = 0;
  context.wheelSpinCounts = [];
  context.wheelLastResult = "";
  context.wheelSessionUpdatedAt = 0;
  context.wheelSessionLotSelections = {};
  assignWheelPendingInventoryIssues(context, []);
  context.wheelSessionNetRevenue = 0;
  context.wheelSessionCostAdjustment = 0;
  context.wheelFairnessHistory = [];
  context.wheelChaseTallyHistory = [];
  context.wheelGridLayoutSeed = "";
  context.wheelPreviewGridLayoutSeed = "";
  context.wheelGridReveals = [];
  context.wheelPreviewGridReveals = [];
  context.wheelPreviewSpinCounts = [];
  context.wheelPreviewTotalSpins = 0;
  context.wheelPreviewFairnessHistory = [];
  context.wheelPreviewChaseTallyHistory = [];
  context.wheelCurrentAngle = 0;
  context.wheelLastResultColor = DEFAULT_WHEEL_LAST_RESULT_COLOR;
  context.wheelSpinHash = "";
  context.wheelSpinSeed = "";
  context.wheelSpinClientSeed = "";
  context.wheelSpinVerificationUrl = "";
  context.wheelSpinAlgorithm = "";
}

export function applyRootWheelSessionSnapshot(
  context: RootWheelSessionStateContext,
  snapshot: Record<string, unknown>
): void {
  if (typeof snapshot.wheelTotalSpins === "number") {
    context.wheelTotalSpins = snapshot.wheelTotalSpins;
  }
  if (Array.isArray(snapshot.wheelSpinCounts)) {
    context.wheelSpinCounts = snapshot.wheelSpinCounts as number[];
  }
  if (typeof snapshot.wheelLastResult === "string") {
    context.wheelLastResult = snapshot.wheelLastResult;
  }
  if (typeof snapshot.wheelSessionUpdatedAt === "number") {
    context.wheelSessionUpdatedAt = snapshot.wheelSessionUpdatedAt;
  }
  if (snapshot.wheelSessionLotSelections && typeof snapshot.wheelSessionLotSelections === "object") {
    context.wheelSessionLotSelections = snapshot.wheelSessionLotSelections as Record<string, number | null>;
  }
  assignWheelPendingInventoryIssues(
    context,
    Array.isArray(snapshot.wheelPendingInventoryIssues)
      ? snapshot.wheelPendingInventoryIssues
      : snapshot.wheelSkippedDeductions
  );
  if (Number.isFinite(Number(snapshot.wheelSessionNetRevenue))) {
    context.wheelSessionNetRevenue = Number(snapshot.wheelSessionNetRevenue) || 0;
  }
  if (Number.isFinite(Number(snapshot.wheelSessionCostAdjustment))) {
    context.wheelSessionCostAdjustment = Number(snapshot.wheelSessionCostAdjustment) || 0;
  }
  context.wheelFairnessHistory = limitFairnessHistory(snapshot.wheelFairnessHistory);
  context.wheelChaseTallyHistory = normalizeTallyHistory(snapshot.wheelChaseTallyHistory);
  context.wheelGridLayoutSeed = String(snapshot.wheelGridLayoutSeed ?? "");
  context.wheelPreviewGridLayoutSeed = String(snapshot.wheelPreviewGridLayoutSeed ?? "");
  context.wheelGridReveals = Array.isArray(snapshot.wheelGridReveals)
    ? (snapshot.wheelGridReveals as MysteryGridReveal[])
    : [];
  context.wheelPreviewGridReveals = Array.isArray(snapshot.wheelPreviewGridReveals)
    ? (snapshot.wheelPreviewGridReveals as MysteryGridReveal[])
    : [];
  if (Array.isArray(snapshot.wheelPreviewSpinCounts)) {
    context.wheelPreviewSpinCounts = snapshot.wheelPreviewSpinCounts as number[];
  }
  if (typeof snapshot.wheelPreviewTotalSpins === "number") {
    context.wheelPreviewTotalSpins = snapshot.wheelPreviewTotalSpins;
  }
  context.wheelPreviewFairnessHistory = limitFairnessHistory(snapshot.wheelPreviewFairnessHistory);
  context.wheelPreviewChaseTallyHistory = normalizeTallyHistory(snapshot.wheelPreviewChaseTallyHistory);
  if (Number.isFinite(Number(snapshot.wheelCurrentAngle))) {
    context.wheelCurrentAngle = Number(snapshot.wheelCurrentAngle) || 0;
  }
  if (typeof snapshot.wheelLastResultColor === "string" && snapshot.wheelLastResultColor.trim()) {
    context.wheelLastResultColor = snapshot.wheelLastResultColor;
  }
  context.wheelSpinHash = String(snapshot.wheelSpinHash ?? "");
  context.wheelSpinSeed = String(snapshot.wheelSpinSeed ?? "");
  context.wheelSpinClientSeed = String(snapshot.wheelSpinClientSeed ?? "");
  context.wheelSpinVerificationUrl = String(snapshot.wheelSpinVerificationUrl ?? "");
  context.wheelSpinAlgorithm = String(snapshot.wheelSpinAlgorithm ?? "");
}

export function buildRootWheelSessionSnapshot(
  context: RootWheelSessionStateContext,
  preserved: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...preserved,
    wheelTotalSpins: context.wheelTotalSpins,
    wheelSpinCounts: context.wheelSpinCounts,
    wheelLastResult: context.wheelLastResult,
    wheelSessionUpdatedAt: context.wheelSessionUpdatedAt,
    wheelSessionLotSelections: context.wheelSessionLotSelections,
    wheelPendingInventoryIssues: context.wheelPendingInventoryIssues,
    wheelSkippedDeductions: context.wheelPendingInventoryIssues,
    wheelSessionNetRevenue: context.wheelSessionNetRevenue ?? preserved.wheelSessionNetRevenue ?? 0,
    wheelSessionCostAdjustment: context.wheelSessionCostAdjustment ?? preserved.wheelSessionCostAdjustment ?? 0,
    wheelFairnessHistory: context.wheelFairnessHistory ?? preserved.wheelFairnessHistory ?? [],
    wheelChaseTallyHistory: context.wheelChaseTallyHistory ?? preserved.wheelChaseTallyHistory ?? [],
    wheelGridLayoutSeed: context.wheelGridLayoutSeed ?? preserved.wheelGridLayoutSeed ?? "",
    wheelPreviewGridLayoutSeed: context.wheelPreviewGridLayoutSeed ?? preserved.wheelPreviewGridLayoutSeed ?? "",
    wheelGridReveals: context.wheelGridReveals ?? preserved.wheelGridReveals ?? [],
    wheelPreviewGridReveals: context.wheelPreviewGridReveals ?? preserved.wheelPreviewGridReveals ?? [],
    wheelPreviewSpinCounts: context.wheelPreviewSpinCounts ?? preserved.wheelPreviewSpinCounts ?? [],
    wheelPreviewTotalSpins: context.wheelPreviewTotalSpins ?? preserved.wheelPreviewTotalSpins ?? 0,
    wheelPreviewFairnessHistory: context.wheelPreviewFairnessHistory ?? preserved.wheelPreviewFairnessHistory ?? [],
    wheelPreviewChaseTallyHistory: context.wheelPreviewChaseTallyHistory ?? preserved.wheelPreviewChaseTallyHistory ?? [],
    wheelCurrentAngle: context.wheelCurrentAngle ?? preserved.wheelCurrentAngle ?? 0,
    wheelLastResultColor: context.wheelLastResultColor
      ?? preserved.wheelLastResultColor
      ?? DEFAULT_WHEEL_LAST_RESULT_COLOR,
    wheelSpinHash: context.wheelSpinHash ?? preserved.wheelSpinHash ?? "",
    wheelSpinSeed: context.wheelSpinSeed ?? preserved.wheelSpinSeed ?? "",
    wheelSpinClientSeed: context.wheelSpinClientSeed ?? preserved.wheelSpinClientSeed ?? "",
    wheelSpinVerificationUrl: context.wheelSpinVerificationUrl ?? preserved.wheelSpinVerificationUrl ?? "",
    wheelSpinAlgorithm: context.wheelSpinAlgorithm ?? preserved.wheelSpinAlgorithm ?? ""
  };
}
