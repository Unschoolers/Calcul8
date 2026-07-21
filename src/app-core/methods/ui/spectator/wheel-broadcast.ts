import type { GameBroadcastContext } from "../../../context/game.ts";
import { fetchAuthenticatedApiResponse } from "../common/shared.ts";
import { buildRootWheelSessionSnapshot } from "../../../shared/wheel-root-session-state.ts";

export async function broadcastWheelSession(app: GameBroadcastContext): Promise<void> {
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

