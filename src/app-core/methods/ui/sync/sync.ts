import type { AppContext, AppMethodState } from "../../../context-app.ts";
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
  async pullCloudSync(forceApply = false): Promise<void> {
    await runCloudSyncPull(this, {}, { forceApply });
  },

  startCloudSyncScheduler(): void {
    startCloudSyncSchedulerService(this);
  },

  stopCloudSyncScheduler(): void {
    stopCloudSyncSchedulerService(this);
  },

  async pushCloudSync(
    force = false,
    options: { allowEmptyOverwrite?: boolean } = {}
  ): Promise<void> {
    await runCloudSyncPush(this, force, {}, options);
  }
};

