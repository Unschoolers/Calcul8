import type { SyncMethodImplementation } from "../../../context/sync.ts";
import {
  runCloudSyncPull,
  runCloudSyncPush,
  startCloudSyncScheduler as startCloudSyncSchedulerService,
  stopCloudSyncScheduler as stopCloudSyncSchedulerService
} from "./sync-service.ts";

export const uiSyncMethods = {
  async pullCloudSync(forceApply = false) {
    return runCloudSyncPull(this, {}, { forceApply });
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
  ) {
    return runCloudSyncPush(this, force, {}, options);
  }
} satisfies SyncMethodImplementation;

