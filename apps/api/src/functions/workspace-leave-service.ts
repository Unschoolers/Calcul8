import { HttpError } from "../lib/auth";
import {
  deactivateWorkspaceMembership,
  getWorkspaceMembership,
  listWorkspaceMemberships,
  softDeleteWorkspace,
  transferWorkspaceOwnership,
  upsertWorkspaceMembership
} from "../lib/cosmos/workspaceRepository";
import { isActiveMembership } from "./workspace-function-helpers";
import type {
  ApiConfig,
  WorkspaceMembershipDocument
} from "../types";

export async function leaveWorkspaceForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string,
  payload: { newOwnerUserId: string; deleteWorkspace: boolean }
): Promise<
  | { workspaceId: string; leftWorkspace: true }
  | { workspaceId: string; deletedWorkspace: true }
  | { workspaceId: string; newOwnerUserId: string }
> {
  const actorMembership = await getWorkspaceMembership(config, actorUserId, workspaceId);
  if (!isActiveMembership(actorMembership)) {
    throw new HttpError(403, "User is not a member of this workspace.");
  }

  if (actorMembership.role !== "owner") {
    await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
    return {
      workspaceId,
      leftWorkspace: true
    };
  }

  const memberships = await listWorkspaceMemberships(config, workspaceId);
  const otherMembers = memberships.filter((membership) => membership.userId !== actorUserId);

  if (otherMembers.length === 0) {
    if (!payload.deleteWorkspace) {
      throw new HttpError(400, "Last workspace owner must confirm workspace deletion.");
    }
    await softDeleteWorkspace(config, workspaceId);
    await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
    return {
      workspaceId,
      deletedWorkspace: true
    };
  }

  const newOwnerUserId = String(payload.newOwnerUserId || "").trim();
  if (!newOwnerUserId) {
    throw new HttpError(400, "Field 'newOwnerUserId' is required when other members remain.");
  }

  const targetMembership = otherMembers.find((membership) => membership.userId === newOwnerUserId);
  if (!targetMembership) {
    throw new HttpError(400, "Selected new owner must already be an active workspace member.");
  }

  await promoteWorkspaceOwner(config, workspaceId, newOwnerUserId, targetMembership);
  await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
  await transferWorkspaceOwnership(config, workspaceId, newOwnerUserId);

  return {
    workspaceId,
    newOwnerUserId
  };
}

async function promoteWorkspaceOwner(
  config: ApiConfig,
  workspaceId: string,
  userId: string,
  targetMembership: WorkspaceMembershipDocument
): Promise<void> {
  await upsertWorkspaceMembership(config, {
    userId,
    workspaceId,
    role: "owner",
    status: "active",
    displayName: targetMembership.displayName,
    photoUrl: targetMembership.photoUrl
  });
}
