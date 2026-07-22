import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../app-core/context/capabilityPorts.ts";
import type { AuthComputedState, AuthMethodState } from "../../app-core/context/auth.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../app-core/context/commerce.ts";
import type { EntitlementMethodState } from "../../app-core/context/entitlements.ts";
import type { RuntimeComputedState, RuntimeMethodState } from "../../app-core/context/runtime.ts";
import type { SyncComputedState } from "../../app-core/context/sync.ts";
import type { WhatnotComputedState, WhatnotMethodState } from "../../app-core/context/whatnot.ts";
import type { WorkspaceComputedState, WorkspaceMethodState } from "../../app-core/context/workspace.ts";
import type { AppState } from "../../types/app.ts";
import { resolveLotSelectorDisplayItem } from "./lotSelectorDisplay.ts";

const shellPortKeys = [
  "activeScopeType", "activeWorkspaceId", "availableWorkspaces", "googleAvatarLoadFailed", "hasProAccess",
  "preferredLanguage", "showCreateWorkspaceModal", "showInstallPrompt", "showSystemConfigurationDialog",
  "whatnotConnectionStatus", "whatnotConnectionSummary", "whatnotReviewBatchId", "whatnotSyncStatus",
  "currentTab", "currentLotId", "guidedOnboardingStatus", "showNewLotModal", "showGoogleSignInFallback",
  "googleProfileName", "googleProfileEmail", "googleProfilePicture", "isDark", "accountSyncBadgeVisible",
  "accountSyncBadgeClass", "accountSyncIcon", "accountSyncIconSize", "accountSyncIconClass", "syncStatusTitle",
  "syncStatusSubtitle", "syncStatusIcon", "currentWorkspaceName", "scopeChipClass", "scopeChipIcon", "scopeChipLabel",
  "isCurrentWorkspaceOwner", "isWorkspaceScopeActive", "activeWorkspaceVisibleMembers",
  "activeWorkspaceOverflowMemberCount", "workspaceRealtimeTitle", "workspaceRealtimeSubtitle", "workspaceRealtimeIcon",
  "workspaceRealtimeManualRefreshVisible", "workspaceRealtimeManualRefreshLabel", "authGateTitle", "authGateSubtitle",
  "whatnotConnectionTitle", "whatnotConnectionSubtitle", "whatnotConnectionIcon", "whatnotConnectActionTitle",
  "whatnotSyncActionTitle", "lotItems", "hasLotSelected", "t", "setPreferredLanguage", "toggleTheme",
  "askConfirmation", "startGuidedOnboarding", "dismissGuidedOnboarding", "promptInstall", "debugLogEntitlement",
  "switchToPersonalWorkspace", "switchToWorkspace", "openWorkspaceMembersModal", "recoverWorkspaceRealtimeNow",
  "getWorkspaceMemberPresenceState", "getWorkspaceMemberPresenceLabel", "connectWhatnot", "disconnectWhatnot",
  "syncWhatnotSales", "openWhatnotCsvImportDialog", "openWhatnotReviewDialog", "clearPersonalAccountData",
  "logoutCurrentSession", "promptGoogleSignIn", "selectLot", "openRenameLotModal"
] as const;

type ShellCapabilitySource = AppState & AuthComputedState & AuthMethodState & CommerceComputedState & CommerceMethodState
  & EntitlementMethodState & RuntimeComputedState & RuntimeMethodState & SyncComputedState & WhatnotComputedState
  & WhatnotMethodState & WorkspaceComputedState & WorkspaceMethodState;
export type ShellPortSource = Pick<ShellCapabilitySource, typeof shellPortKeys[number]>;
export type ShellPorts = ShellPortSource & { resolveLotSelectorDisplayItem: typeof resolveLotSelectorDisplayItem };
export const shellPortsKey: InjectionKey<ShellPorts> = Symbol("shellPorts");

export function createShellPorts(source: ShellPortSource): ShellPorts {
  const ports = createCapabilityPorts(source, shellPortKeys) as ShellPorts;
  Object.defineProperty(ports, "resolveLotSelectorDisplayItem", { enumerable: true, value: resolveLotSelectorDisplayItem });
  return ports;
}

export function useShellPorts(): ShellPorts {
  const ports = inject(shellPortsKey, null);
  if (!ports) throw new Error("Shell capabilities were not provided.");
  return ports;
}
