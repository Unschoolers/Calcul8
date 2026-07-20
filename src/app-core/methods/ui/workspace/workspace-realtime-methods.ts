import type { WorkspaceRealtimeMethodImplementation } from "../../../context/workspace.ts";
import { runWorkspaceRealtimeCatchUp } from "./workspace-realtime-recovery.ts";

export const uiWorkspaceRealtimeMethods = {
  async recoverWorkspaceRealtimeNow(): Promise<void> {
    await runWorkspaceRealtimeCatchUp(this, { reason: "manual" });
  }
} satisfies WorkspaceRealtimeMethodImplementation;
