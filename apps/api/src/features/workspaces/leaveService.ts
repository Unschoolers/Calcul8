import { HttpError } from "../../lib/auth";
import {
  deactivateWorkspaceMembership,
  getWorkspaceById,
  getWorkspaceMembership,
  listWorkspaceMemberships,
  restoreWorkspaceDocument,
  softDeleteWorkspace,
  transferWorkspaceOwnership,
  upsertWorkspaceMembership
} from "../../lib/cosmos/workspaceRepository";
import { isActiveMembership, isWorkspaceDeleted } from "./helpers";
import type {
  ApiConfig,
  WorkspaceDocument,
  WorkspaceMembershipDocument
} from "../../types";

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
  const workspace = await getWorkspaceById(config, workspaceId);
  if (!workspace || isWorkspaceDeleted(workspace)) {
    throw new HttpError(404, "Workspace was not found.");
  }

  const actorMembership = await getWorkspaceMembership(config, actorUserId, workspaceId);
  if (!isActiveMembership(actorMembership)) {
    throw new HttpError(403, "User is not a member of this workspace.");
  }

  if (actorMembership.role !== "owner") {
    const removed = await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
    if (!removed) {
      throw new HttpError(409, "Workspace leave conflicted. Refresh and try again.");
    }
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
    const deletedWorkspace = await softDeleteWorkspace(config, workspaceId, actorUserId);
    if (!deletedWorkspace) {
      throw new HttpError(409, "Workspace deletion conflicted. Refresh and try again.");
    }
    try {
      const removed = await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
      if (!removed) {
        throw new HttpError(409, "Workspace deletion conflicted. Refresh and try again.");
      }
    } catch (error) {
      await rollbackWorkspaceDeletion(config, workspace, error);
      throw error;
    }
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
  try {
    const transferredWorkspace = await transferWorkspaceOwnership(config, workspaceId, newOwnerUserId, actorUserId);
    if (!transferredWorkspace) {
      throw new HttpError(409, "Workspace ownership transfer conflicted. Refresh and try again.");
    }
  } catch (error) {
    await restoreWorkspaceMemberRole(config, workspaceId, targetMembership);
    throw error;
  }
  try {
    const removed = await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
    if (!removed) {
      throw new HttpError(409, "Workspace leave conflicted. Refresh and try again.");
    }
  } catch (error) {
    await rollbackWorkspaceOwnershipTransfer(config, workspaceId, actorUserId, actorMembership, targetMembership, error);
    throw error;
  }

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

async function restoreWorkspaceMemberRole(
  config: ApiConfig,
  workspaceId: string,
  membership: WorkspaceMembershipDocument
): Promise<void> {
  await upsertWorkspaceMembership(config, {
    userId: membership.userId,
    workspaceId,
    role: membership.role ?? "member",
    status: membership.status ?? "active",
    displayName: membership.displayName,
    photoUrl: membership.photoUrl,
    updatedAt: membership.updatedAt
  });
}

async function rollbackWorkspaceOwnershipTransfer(
  config: ApiConfig,
  workspaceId: string,
  actorUserId: string,
  actorMembership: WorkspaceMembershipDocument,
  targetMembership: WorkspaceMembershipDocument,
  cause: unknown
): Promise<void> {
  try {
    // Ownership transfer spans workspace and membership partitions, so restore both
    // documents if the final leave write fails after the workspace owner changed.
    await transferWorkspaceOwnership(config, workspaceId, actorUserId, targetMembership.userId);
    await restoreWorkspaceMemberRole(config, workspaceId, targetMembership);
    await upsertWorkspaceMembership(config, {
      userId: actorUserId,
      workspaceId,
      role: actorMembership.role ?? "owner",
      status: actorMembership.status ?? "active",
      displayName: actorMembership.displayName,
      photoUrl: actorMembership.photoUrl,
      updatedAt: actorMembership.updatedAt
    });
  } catch (cleanupError) {
    if (cause && typeof cause === "object") {
      (cause as { cleanupError?: unknown }).cleanupError = cleanupError;
    }
  }
}

async function rollbackWorkspaceDeletion(
  config: ApiConfig,
  workspace: WorkspaceDocument,
  cause: unknown
): Promise<void> {
  try {
    // Last-owner deletion updates the workspace and membership documents separately;
    // restore the workspace if the membership removal does not land.
    await restoreWorkspaceDocument(config, workspace);
  } catch (cleanupError) {
    if (cause && typeof cause === "object") {
      (cause as { cleanupError?: unknown }).cleanupError = cleanupError;
    }
  }
}
