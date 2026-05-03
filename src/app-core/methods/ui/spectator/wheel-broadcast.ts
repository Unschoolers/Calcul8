import type { AppContext } from "../../../context-app.ts";
import { fetchAuthenticatedApiResponse } from "../common/shared.ts";
import {
  buildRootWheelSessionSnapshot,
  type RootWheelSessionStateContext
} from "../../../shared/wheel-root-session-state.ts";

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
  | "wheelSessionLotSelections"
  | "wheelPendingInventoryIssues"
  | "wheelSkippedDeductions"
  | "googleAuthEpoch"
  | "hasProAccess"
> & RootWheelSessionStateContext;

export async function broadcastWheelSession(app: BroadcastApp): Promise<void> {
  if (app.activeScopeType !== "workspace" || !app.activeWorkspaceId) return;
  const sentAt = Date.now();
  app.wheelSessionUpdatedAt = sentAt;

  try {
    const rootSession = buildRootWheelSessionSnapshot(app);
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
            ...rootSession,
            wheelSessionUpdatedAt: sentAt
          }
        })
      },
      { expireAuthOn401: false }
    );
  } catch {
    // best-effort — ignore broadcast errors
  }
}

