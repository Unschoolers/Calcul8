import type { AppContext, AppMethodState } from "../../../context-app.ts";
import { runWorkspaceRealtimeCatchUp } from "./workspace-realtime-recovery.ts";

export const uiWorkspaceRealtimeMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  "recoverWorkspaceRealtimeNow"
> = {
  async recoverWorkspaceRealtimeNow(): Promise<void> {
    await runWorkspaceRealtimeCatchUp(this, { reason: "manual" });
  }
};
