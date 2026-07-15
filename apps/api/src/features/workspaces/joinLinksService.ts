import { HttpError } from "../../lib/auth";
import {
  createWorkspaceJoinLink,
  getWorkspaceById,
  getWorkspaceJoinLinkByInviteId,
  listWorkspaceJoinLinks,
  revokeWorkspaceJoinLink
} from "../../lib/cosmos/workspaceRepository";
import {
  assertCanManageWorkspaceMembership,
  buildJoinInvitePath,
  buildWorkspaceJoinLinkExpiresAt,
  createJoinInviteId,
  createJoinToken,
  getJoinLinkState,
  hashJoinToken,
  isWorkspaceActive
} from "./helpers";
import type {
  ApiConfig,
} from "../../types";

export async function listWorkspaceJoinLinksForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string
): Promise<{
  workspaceId: string;
  links: Array<{
    inviteId: string;
    status: string;
    expiresAt: string;
  }>;
}> {
  await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

  const links = await listWorkspaceJoinLinks(config, workspaceId);
  return {
    workspaceId,
    links: links.map((link) => ({
      inviteId: link.inviteId,
      status: getJoinLinkState(link),
      expiresAt: link.expiresAt
    }))
  };
}

export async function createWorkspaceJoinLinkForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string
): Promise<{
  inviteId: string;
  inviteUrl: string;
  expiresAt: string;
}> {
  await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

  const workspace = await getWorkspaceById(config, workspaceId);
  if (!isWorkspaceActive(workspace)) {
    throw new HttpError(404, "Workspace was not found.");
  }

  const inviteToken = createJoinToken();
  const inviteId = createJoinInviteId();
  const expiresAt = buildWorkspaceJoinLinkExpiresAt();
  await createWorkspaceJoinLink(config, {
    inviteId,
    workspaceId,
    createdByUserId: actorUserId,
    tokenHash: hashJoinToken(inviteToken),
    expiresAt
  });

  return {
    inviteId,
    inviteUrl: buildJoinInvitePath(inviteToken),
    expiresAt
  };
}

export async function revokeWorkspaceJoinLinkForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string,
  inviteId: string
): Promise<{
  inviteId: string;
  workspaceId: string;
}> {
  await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

  const existing = await getWorkspaceJoinLinkByInviteId(config, inviteId);
  if (!existing || existing.workspaceId !== workspaceId) {
    throw new HttpError(404, "Workspace join link was not found.");
  }

  const revoked = await revokeWorkspaceJoinLink(config, inviteId);
  if (!revoked) {
    throw new HttpError(404, "Workspace join link was not found.");
  }

  return {
    inviteId,
    workspaceId
  };
}
