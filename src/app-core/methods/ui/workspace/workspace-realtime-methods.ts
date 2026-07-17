import type { AppMethodImplementation } from "../../../context-app.ts";
import { runWorkspaceRealtimeCatchUp } from "./workspace-realtime-recovery.ts";

export const uiWorkspaceRealtimeMethods = {
  async recoverWorkspaceRealtimeNow(): Promise<void> {
    await runWorkspaceRealtimeCatchUp(this, { reason: "manual" });
  }
} satisfies AppMethodImplementation;
