import type { ApiConfig, BuyerProfileDocument } from "../../types";
import {
  deleteBuyerProfile,
  listBuyerProfiles,
  upsertBuyerProfile
} from "../../lib/cosmos/buyerProfileRepository";
import { hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import { assertSyncScopeAccess, resolveSyncScope } from "../../lib/syncScopeResolution";

export interface BuyerProfileDto {
  username: string;
  preferredName?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SaveBuyerProfileForActorInput {
  workspaceId?: string;
  username: string;
  preferredName?: string;
  tags: string[];
  baseVersion: number;
  mutationId: string;
}

export interface DeleteBuyerProfileForActorInput {
  workspaceId?: string;
  username: string;
  baseVersion: number;
  mutationId: string;
}

export interface SaveBuyerProfileForActorResult {
  profileId: string;
  profile: BuyerProfileDto;
}

export interface DeleteBuyerProfileForActorResult {
  profileId: string;
  version: number;
}

export function toBuyerProfileDto(document: BuyerProfileDocument): BuyerProfileDto {
  return {
    username: document.username,
    preferredName: document.preferredName,
    tags: [...document.tags],
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    version: document.version
  };
}

async function resolveAuthorizedScope(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
) {
  const scope = resolveSyncScope(actorUserId, workspaceId);
  await assertSyncScopeAccess(
    scope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );
  return scope;
}

export async function listBuyerProfilesForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
): Promise<BuyerProfileDto[]> {
  const scope = await resolveAuthorizedScope(config, actorUserId, workspaceId);
  const profiles = await listBuyerProfiles(config, scope.partitionKey);
  return profiles.map(toBuyerProfileDto);
}

export async function saveBuyerProfileForActor(
  config: ApiConfig,
  actorUserId: string,
  input: SaveBuyerProfileForActorInput
): Promise<SaveBuyerProfileForActorResult> {
  const scope = await resolveAuthorizedScope(config, actorUserId, input.workspaceId);
  const document = await upsertBuyerProfile(config, {
    scopeKey: scope.partitionKey,
    username: input.username,
    preferredName: input.preferredName,
    tags: input.tags,
    updatedBy: actorUserId,
    mutationId: input.mutationId,
    baseVersion: input.baseVersion
  });
  return {
    profileId: document.id,
    profile: toBuyerProfileDto(document)
  };
}

export async function deleteBuyerProfileForActor(
  config: ApiConfig,
  actorUserId: string,
  input: DeleteBuyerProfileForActorInput
): Promise<DeleteBuyerProfileForActorResult> {
  const scope = await resolveAuthorizedScope(config, actorUserId, input.workspaceId);
  const document = await deleteBuyerProfile(config, {
    scopeKey: scope.partitionKey,
    username: input.username,
    updatedBy: actorUserId,
    mutationId: input.mutationId,
    baseVersion: input.baseVersion
  });
  return {
    profileId: document?.id ?? "",
    version: document?.version ?? input.baseVersion
  };
}
