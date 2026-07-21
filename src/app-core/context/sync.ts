import type { AppState, SystemPricingDefaults } from "../../types/app.ts";
import type {
  SyncLotDto,
  SyncSalesByLotDto,
  SyncWheelConfigDto
} from "../../../shared/sync-contracts.mjs";
import type { CommerceMethodState } from "./commerce.ts";
import type { RuntimeMethodState, FeatureMethodImplementation } from "./runtime.ts";
import type { WorkspaceComputedState, WorkspaceMethodState } from "./workspace.ts";

export interface SyncComputedState {
  accountSyncBadgeVisible: boolean;
  accountSyncBadgeClass: string;
  accountSyncIcon: string;
  accountSyncIconSize: number;
  accountSyncIconClass: string;
  syncStatusTitle: string;
  syncStatusSubtitle: string;
  syncStatusIcon: string;
}

export type SyncComputedContext = Pick<
  AppState,
  "syncStatus" | "workspaceRealtimeStatus" | "preferredLanguage"
> & Pick<WorkspaceComputedState, "isWorkspaceScopeActive">;

export type SyncComputedObject = {
  [Key in keyof SyncComputedState]: (this: SyncComputedContext) => SyncComputedState[Key];
};

export interface SyncMethodState {
  pullCloudSync(forceApply?: boolean): Promise<void>;
  pushCloudSync(force?: boolean, options?: { allowEmptyOverwrite?: boolean }): Promise<void>;
  startCloudSyncScheduler(): void;
  stopCloudSyncScheduler(): void;
}

export type SyncPayloadContext = Pick<
  AppState,
  "lots" | "currentLotId" | "wheelConfigs" | "activeWheelConfigId"
> &
  Partial<Pick<AppState, "systemPricingDefaults">> & {
    workspaceId?: unknown;
  };

export interface SyncParsedSnapshot {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  systemPricingDefaults?: SystemPricingDefaults;
  version: number;
  hasData: boolean;
}

export type SyncSnapshotApplyContext = Pick<
  AppState,
  | "lots"
  | "wheelConfigs"
  | "activeWheelConfigId"
  | "currentLotId"
  | "sales"
  | "activeScopeType"
  | "activeWorkspaceId"
> &
  Pick<CommerceMethodState, "getSalesStorageKey" | "loadLot"> &
  Partial<Pick<AppState, "systemPricingDefaults" | "salesByLotId">>;

export type SyncStatusContext = Pick<AppState, "syncStatus" | "syncStatusResetTimeoutId">;

export type SyncPollingContext = Pick<
  AppState,
  "liveSpotPrice" | "liveBoxPriceSell" | "livePackPrice" | "currentLivePricingVersion"
>;

export type SyncSessionContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "isOffline"
  | "lastSyncedPayloadHash"
  | "googleAuthEpoch"
  | "hasProAccess"
> &
  Pick<RuntimeMethodState, "notify" | "startOfflineReconnectScheduler"> &
  Pick<SyncMethodState, "pullCloudSync" | "stopCloudSyncScheduler"> &
  Pick<WorkspaceMethodState, "handleWorkspaceAccessLost">;

export type SyncServiceContext = SyncPayloadContext &
  SyncSnapshotApplyContext &
  SyncStatusContext &
  SyncSessionContext &
  Pick<AppState, "cloudSyncIntervalId" | "isOffline" | "lastSyncedPayloadHash" | "systemPricingDefaults"> &
  Pick<CommerceMethodState, "loadSalesForLotId">;

export type SyncMethodImplementation = FeatureMethodImplementation<
  SyncServiceContext,
  SyncMethodState
>;
