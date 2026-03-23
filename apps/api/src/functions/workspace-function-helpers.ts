import { createHash, randomBytes } from "node:crypto";
import type { HttpRequest } from "@azure/functions";
import { HttpError } from "../lib/auth";
import { getWorkspaceById, getWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import type {
  ApiConfig,
  UserProfileDocument,
  WorkspaceDocument,
  WorkspaceJoinLinkDocument,
  WorkspaceMembershipDocument,
  WorkspaceRole
} from "../types";
import { requireRequestBodyRecord } from "./request-function-helpers";

const JOIN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isWorkspaceDeleted(workspace: WorkspaceDocument | null | undefined): boolean {
  return workspace?.status === "deleted";
}

export function isActiveMembership(
  membership: WorkspaceMembershipDocument | null | undefined
): membership is WorkspaceMembershipDocument {
  if (!membership) return false;
  return membership.status !== "disabled" && membership.status !== "removed";
}

export function canManageWorkspaceMembership(
  membership: WorkspaceMembershipDocument | null
): membership is WorkspaceMembershipDocument {
  return isActiveMembership(membership) && membership.role === "owner";
}

export async function assertCanManageWorkspaceMembership(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string
): Promise<WorkspaceMembershipDocument> {
  const actorMembership = await getWorkspaceMembership(config, actorUserId, workspaceId);
  if (!canManageWorkspaceMembership(actorMembership)) {
    throw new HttpError(403, "Only workspace owner can manage members.");
  }
  return actorMembership;
}

function normalizeWorkspaceRole(rawRole: unknown): WorkspaceRole {
  const role = String(rawRole ?? "member").trim().toLowerCase();
  if (role === "owner" || role === "member") {
    return role;
  }
  throw new HttpError(400, "Field 'role' must be one of: owner, member.");
}

export function parseCreateWorkspaceBody(raw: unknown): { name: string } {
  const payload = requireRequestBodyRecord(raw) as { name?: unknown };
  const name = String(payload.name ?? "").trim();

  if (!name) {
    throw new HttpError(400, "Field 'name' is required.");
  }

  return { name };
}

export async function createUniqueWorkspaceId(
  config: ApiConfig,
  maxAttempts = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const workspaceId = `ws_${randomBytes(8).toString("hex")}`;
    const existing = await getWorkspaceById(config, workspaceId);
    if (!existing || isWorkspaceDeleted(existing)) {
      return workspaceId;
    }
  }

  throw new HttpError(500, "Failed to generate a unique workspace id.");
}

export function parseUpsertWorkspaceMemberBody(raw: unknown): { userId: string; role: WorkspaceRole } {
  const payload = requireRequestBodyRecord(raw) as { userId?: unknown; role?: unknown };
  const userId = String(payload.userId ?? "").trim();

  if (!userId) {
    throw new HttpError(400, "Field 'userId' is required.");
  }

  return {
    userId,
    role: normalizeWorkspaceRole(payload.role)
  };
}

export function parseJoinAcceptBody(raw: unknown): { inviteToken: string; preview: boolean } {
  const payload = requireRequestBodyRecord(raw) as { inviteToken?: unknown; preview?: unknown };
  const inviteToken = String(payload.inviteToken ?? "").trim();
  if (!inviteToken) {
    throw new HttpError(400, "Field 'inviteToken' is required.");
  }

  return {
    inviteToken,
    preview: payload.preview === true
  };
}

export function parseLeaveWorkspaceBody(raw: unknown): { newOwnerUserId: string; deleteWorkspace: boolean } {
  if (raw == null) {
    return {
      newOwnerUserId: "",
      deleteWorkspace: false
    };
  }

  const payload = requireRequestBodyRecord(raw) as { newOwnerUserId?: unknown; deleteWorkspace?: unknown };
  return {
    newOwnerUserId: String(payload.newOwnerUserId ?? "").trim(),
    deleteWorkspace: payload.deleteWorkspace === true
  };
}

export function createJoinToken(): string {
  return randomBytes(24).toString("hex");
}

export function createJoinInviteId(): string {
  return randomBytes(12).toString("hex");
}

export function hashJoinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildJoinInvitePath(inviteToken: string): string {
  return `/?invite=${encodeURIComponent(inviteToken)}`;
}

export function buildWorkspaceJoinLinkExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + JOIN_LINK_TTL_MS).toISOString();
}

export function getJoinLinkState(link: WorkspaceJoinLinkDocument): WorkspaceJoinLinkDocument["status"] {
  if (link.status === "revoked" || link.status === "used") return link.status;
  const expiresAtMs = Date.parse(link.expiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    return "expired";
  }
  return "active";
}

export function buildWorkspaceMemberPayload(
  membership: WorkspaceMembershipDocument,
  profile?: UserProfileDocument | null
): Record<string, unknown> {
  const snapshotDisplayName = String(membership.displayName || "").trim();
  const snapshotPhotoUrl = String(membership.photoUrl || "").trim();
  return {
    ...membership,
    displayName: snapshotDisplayName || profile?.displayName || undefined,
    photoUrl: snapshotPhotoUrl || profile?.photoUrl || undefined
  };
}

export function hasWorkspaceMemberProfileSnapshot(membership: WorkspaceMembershipDocument): boolean {
  return String(membership.displayName || "").trim().length > 0;
}
