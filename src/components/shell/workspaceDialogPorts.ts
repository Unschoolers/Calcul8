import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../app-core/context/capabilityPorts.ts";
import type { CommerceComputedState, CommerceMethodState } from "../../app-core/context/commerce.ts";
import type { EntitlementMethodState } from "../../app-core/context/entitlements.ts";
import type { RuntimeMethodState } from "../../app-core/context/runtime.ts";
import type { WorkspaceComputedState, WorkspaceMethodState } from "../../app-core/context/workspace.ts";
import type { AppState } from "../../types/app.ts";

const workspaceDialogPortKeys = [
  "showCreateWorkspaceModal", "newWorkspaceName", "isCreatingWorkspace", "activeScopeType", "showWorkspaceMembersModal",
  "isCreatingWorkspaceJoinLink", "isWorkspaceMembersLoading", "workspaceMembers", "showLeaveWorkspaceModal",
  "isLeavingWorkspace", "leaveWorkspaceTransferMemberUserId", "leaveWorkspaceDeleteConfirmation", "showWorkspaceJoinDialog",
  "isAcceptingWorkspaceInvite", "showSystemConfigurationDialog", "systemPricingDefaults", "hasProAccess", "externalSku",
  "sellingCurrency", "targetProfitPercent", "sellingTaxPercent", "sellingShippingPerOrder", "feeProfilePreset", "spotsPerBox",
  "currentWorkspaceName", "isCurrentWorkspaceOwner", "pendingWorkspaceInviteTargetName", "currentLotType",
  "currentLotUsesSystemPricingDefaults", "hasLotSelected", "createWorkspace", "createWorkspaceJoinLink",
  "openLeaveWorkspaceModal", "removeWorkspaceMember", "leaveCurrentWorkspace", "dismissPendingWorkspaceInvite",
  "acceptPendingWorkspaceInvite", "getWorkspaceMemberPresenceState", "getWorkspaceMemberPresenceLabel",
  "onSystemPricingDefaultsChange", "setSystemFeeProfilePreset", "setCurrentLotSystemPricingDefaultsMode",
  "onPurchaseConfigChange", "setFeeProfilePreset", "accessProFeature", "formatDate", "t"
] as const;

type WorkspaceDialogCapabilitySource = AppState & CommerceComputedState & CommerceMethodState & EntitlementMethodState
  & RuntimeMethodState & WorkspaceComputedState & WorkspaceMethodState;
export type WorkspaceDialogPorts = Pick<WorkspaceDialogCapabilitySource, typeof workspaceDialogPortKeys[number]>;
export const workspaceDialogPortsKey: InjectionKey<WorkspaceDialogPorts> = Symbol("workspaceDialogPorts");

export function createWorkspaceDialogPorts(source: WorkspaceDialogPorts): WorkspaceDialogPorts {
  return createCapabilityPorts(source, workspaceDialogPortKeys);
}

export function useWorkspaceDialogPorts(): WorkspaceDialogPorts {
  const ports = inject(workspaceDialogPortsKey, null);
  if (!ports) throw new Error("Workspace dialog capabilities were not provided.");
  return ports;
}
