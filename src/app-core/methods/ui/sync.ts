import type { AppContext, AppMethodState } from "../../context.ts";
import {
  runCloudSyncPull,
  runCloudSyncPush,
  startCloudSyncScheduler as startCloudSyncSchedulerService,
  stopCloudSyncScheduler as stopCloudSyncSchedulerService
} from "./sync-service.ts";

export const uiSyncMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "pullCloudSync"
  | "startCloudSyncScheduler"
  | "stopCloudSyncScheduler"
  | "pushCloudSync"
> = {
  async pullCloudSync(): Promise<void> {
    await runCloudSyncPull(this);
  },

  startCloudSyncScheduler(): void {
    startCloudSyncSchedulerService(this);
  },

  stopCloudSyncScheduler(): void {
    stopCloudSyncSchedulerService(this);
  },

  async pushCloudSync(force = false): Promise<void> {
    await runCloudSyncPush(this, force);
  }
};
