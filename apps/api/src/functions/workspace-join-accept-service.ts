import { HttpError } from "../lib/auth";
import {
  getWorkspaceById,
  getWorkspaceJoinLinkByTokenHash,
  getWorkspaceMembership,
  markWorkspaceJoinLinkUsed,
  upsertWorkspaceMembership
} from "../lib/cosmos/workspaceRepository";
import {
  getJoinLinkState,
  hashJoinToken,
  isActiveMembership,
  isWorkspaceDeleted
} from "./workspace-function-helpers";
import type {
  ApiConfig,
  WorkspaceMembershipDocument
} from "../types";

export async function acceptWorkspaceJoinLinkForActor(
  config: ApiConfig,
  actorUserId: string,
  payload: { inviteToken: string; preview: boolean }
): Promise<
  | {
    ok: true;
    preview: true;
    workspaceId: string;
    workspaceName: string;
  }
  | {
    ok: true;
    workspaceId: string;
    workspaceName: string;
    membership: WorkspaceMembershipDocument;
  }
> {
  const joinLink = await getWorkspaceJoinLinkByTokenHash(config, hashJoinToken(payload.inviteToken));

  if (!joinLink) {
    throw new HttpError(404, "Workspace join link was not found.");
  }

  const joinLinkState = getJoinLinkState(joinLink);
  if (joinLinkState === "used") {
    throw new HttpError(409, "Workspace join link has already been used.");
  }
  if (joinLinkState === "revoked" || joinLinkState === "expired") {
    throw new HttpError(410, "Workspace join link is no longer valid.");
  }

  const workspace = await getWorkspaceById(config, joinLink.workspaceId);
  if (!workspace || isWorkspaceDeleted(workspace)) {
    throw new HttpError(404, "Workspace was not found.");
  }

  if (payload.preview) {
    return {
      ok: true,
      preview: true,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.name
    };
  }

  const existingMembership = await getWorkspaceMembership(config, actorUserId, joinLink.workspaceId);
  if (isActiveMembership(existingMembership)) {
    throw new HttpError(409, "User is already a member of this workspace.");
  }

  const membership = await upsertWorkspaceMembership(config, {
    userId: actorUserId,
    workspaceId: joinLink.workspaceId,
    role: "member",
    status: "active"
  });
  await markWorkspaceJoinLinkUsed(config, joinLink.inviteId, actorUserId);

  return {
    ok: true,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.name,
    membership
  };
}
