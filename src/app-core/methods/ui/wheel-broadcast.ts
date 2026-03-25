import type { AppContext } from "../../context.ts";
import { fetchAuthenticatedApiResponse } from "./shared.ts";

type BroadcastApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "wheelConfigs"
  | "activeWheelConfigId"
  | "wheelTotalSpins"
  | "wheelSpinCounts"
  | "wheelLastResult"
  | "wheelSessionUpdatedAt"
  | "wheelSkippedDeductions"
  | "googleAuthEpoch"
  | "hasProAccess"
>;

export async function broadcastWheelSession(app: BroadcastApp): Promise<void> {
  if (app.activeScopeType !== "workspace" || !app.activeWorkspaceId) return;
  const sentAt = Date.now();
  app.wheelSessionUpdatedAt = sentAt;

  try {
    await fetchAuthenticatedApiResponse(
      app,
      "/wheel/broadcast",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: app.activeWorkspaceId,
          session: {
            wheelConfigs: app.wheelConfigs,
            activeWheelConfigId: app.activeWheelConfigId,
            wheelTotalSpins: app.wheelTotalSpins,
            wheelSpinCounts: app.wheelSpinCounts,
            wheelLastResult: app.wheelLastResult,
            wheelSessionUpdatedAt: sentAt,
            wheelSkippedDeductions: app.wheelSkippedDeductions
          }
        })
      },
      { expireAuthOn401: false }
    );
  } catch {
    // best-effort — ignore broadcast errors
  }
}
