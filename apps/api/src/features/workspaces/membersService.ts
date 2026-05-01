import { HttpError } from "../../lib/auth";
import { listUserProfiles } from "../../lib/cosmos/entitlementRepository";
import {
  assertCanManageWorkspaceMembership,
  buildWorkspaceMemberPayload,
  hasWorkspaceMemberProfileSnapshot,
  isActiveMembership
} from "./helpers";
import {
  deactivateWorkspaceMembership,
  getWorkspaceMembership,
  hasWorkspaceMembership,
  listWorkspaceMemberships,
  upsertWorkspaceMembership
} from "../../lib/cosmos/workspaceRepository";
import type {
  ApiConfig,
  UserProfileDocument,
  WorkspaceMembershipDocument,
  WorkspaceRole
} from "../../types";

export async function listWorkspaceMembersForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string
): Promise<{
  workspaceId: string;
  count: number;
  memberships: Array<Record<string, unknown>>;
}> {
  const isMember = await hasWorkspaceMembership(config, actorUserId, workspaceId);
  if (!isMember) {
    throw new HttpError(403, "User is not a member of this workspace.");
  }

  const memberships = await listWorkspaceMemberships(config, workspaceId);
  const membershipsMissingSnapshot = memberships.filter((membership) => !hasWorkspaceMemberProfileSnapshot(membership));
  const profiles = membershipsMissingSnapshot.length > 0
    ? await listUserProfiles(
      config,
      membershipsMissingSnapshot.map((membership) => membership.userId)
    )
    : [];
  const profilesByUserId = new Map(profiles.map((profile) => [profile.userId, profile] as const));
  const responseMemberships = memberships.map((membership) =>
    buildWorkspaceMemberPayload(membership, profilesByUserId.get(membership.userId))
  );

  const backfillTargets = membershipsMissingSnapshot
    .map((membership) => ({
      membership,
      profile: profilesByUserId.get(membership.userId)
    }))
    .filter((entry): entry is { membership: WorkspaceMembershipDocument; profile: UserProfileDocument } =>
      !!entry.profile?.displayName?.trim()
    );

  if (backfillTargets.length > 0) {
    await Promise.allSettled(
      backfillTargets.map(({ membership, profile }) =>
        upsertWorkspaceMembership(config, {
          userId: membership.userId,
          workspaceId: membership.workspaceId,
          role: membership.role ?? "member",
          status: membership.status ?? "active",
          displayName: profile.displayName,
          photoUrl: profile.photoUrl,
          updatedAt: membership.updatedAt
        })
      )
    );
  }

  return {
    workspaceId,
    count: memberships.length,
    memberships: responseMemberships
  };
}

export async function addWorkspaceMemberForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string,
  payload: { userId: string; role: WorkspaceRole }
): Promise<{
  workspaceId: string;
  membership: WorkspaceMembershipDocument;
}> {
  await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

  const membership = await upsertWorkspaceMembership(config, {
    userId: payload.userId,
    workspaceId,
    role: payload.role,
    status: "active"
  });

  return {
    workspaceId,
    membership
  };
}

export async function removeWorkspaceMemberForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string,
  memberUserId: string
): Promise<{
  workspaceId: string;
  memberUserId: string;
}> {
  await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

  if (memberUserId === actorUserId) {
    throw new HttpError(400, "Workspace owner must use the leave flow.");
  }

  const targetMembership = await getWorkspaceMembership(config, memberUserId, workspaceId);
  if (!targetMembership || !isActiveMembership(targetMembership)) {
    throw new HttpError(404, "Workspace membership was not found.");
  }
  if (targetMembership.role === "owner") {
    throw new HttpError(400, "Workspace owner membership cannot be removed.");
  }

  await deactivateWorkspaceMembership(config, memberUserId, workspaceId);
  return {
    workspaceId,
    memberUserId
  };
}
