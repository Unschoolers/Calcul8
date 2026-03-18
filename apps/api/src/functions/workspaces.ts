import { createHash, randomBytes } from "node:crypto";
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { listUserProfiles } from "../lib/cosmos/entitlementRepository";
import { getConfig } from "../lib/config";
import {
  createWorkspaceJoinLink,
  createWorkspaceWithOwner,
  deactivateWorkspaceMembership,
  getWorkspaceById,
  getWorkspaceJoinLinkByTokenHash,
  getWorkspaceMembership,
  hasWorkspaceMembership,
  listWorkspaceJoinLinks,
  listWorkspaceMemberships,
  listWorkspacesForUser,
  markWorkspaceJoinLinkUsed,
  revokeWorkspaceJoinLink,
  softDeleteWorkspace,
  transferWorkspaceOwnership,
  upsertWorkspaceMembership
} from "../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { logApiTelemetry } from "../lib/telemetry";
import type {
  UserProfileDocument,
  WorkspaceDocument,
  WorkspaceJoinLinkDocument,
  WorkspaceMembershipDocument,
  WorkspaceRole
} from "../types";

const JOIN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseWorkspaceIdFromParams(request: HttpRequest): string {
  const workspaceId = String(request.params?.workspaceId ?? "").trim();
  if (!workspaceId) {
    throw new HttpError(400, "Route param 'workspaceId' is required.");
  }
  return workspaceId;
}

function parseMemberUserIdFromParams(request: HttpRequest): string {
  const memberUserId = String(request.params?.memberUserId ?? "").trim();
  if (!memberUserId) {
    throw new HttpError(400, "Route param 'memberUserId' is required.");
  }
  return memberUserId;
}

function parseInviteIdFromParams(request: HttpRequest): string {
  const inviteId = String(request.params?.inviteId ?? "").trim();
  if (!inviteId) {
    throw new HttpError(400, "Route param 'inviteId' is required.");
  }
  return inviteId;
}

function isWorkspaceDeleted(workspace: WorkspaceDocument | null | undefined): boolean {
  return workspace?.status === "deleted";
}

function isActiveMembership(membership: WorkspaceMembershipDocument | null | undefined): membership is WorkspaceMembershipDocument {
  if (!membership) return false;
  return membership.status !== "disabled" && membership.status !== "removed";
}

function canManageWorkspaceMembership(
  membership: WorkspaceMembershipDocument | null
): membership is WorkspaceMembershipDocument {
  return isActiveMembership(membership) && membership.role === "owner";
}

async function assertCanManageWorkspaceMembership(
  config: ReturnType<typeof getConfig>,
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

async function readRequestJson(request: HttpRequest): Promise<unknown | null> {
  if (typeof request.json !== "function") return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseCreateWorkspaceBody(raw: unknown): { name: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const payload = raw as { name?: unknown };
  const name = String(payload.name ?? "").trim();

  if (!name) {
    throw new HttpError(400, "Field 'name' is required.");
  }

  return { name };
}

async function createUniqueWorkspaceId(
  config: ReturnType<typeof getConfig>,
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

function parseUpsertWorkspaceMemberBody(raw: unknown): { userId: string; role: WorkspaceRole } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const payload = raw as { userId?: unknown; role?: unknown };
  const userId = String(payload.userId ?? "").trim();

  if (!userId) {
    throw new HttpError(400, "Field 'userId' is required.");
  }

  return {
    userId,
    role: normalizeWorkspaceRole(payload.role)
  };
}

function parseJoinAcceptBody(raw: unknown): { inviteToken: string; preview: boolean } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const payload = raw as { inviteToken?: unknown; preview?: unknown };
  const inviteToken = String(payload.inviteToken ?? "").trim();
  if (!inviteToken) {
    throw new HttpError(400, "Field 'inviteToken' is required.");
  }

  return {
    inviteToken,
    preview: payload.preview === true
  };
}

function parseLeaveWorkspaceBody(raw: unknown): { newOwnerUserId: string; deleteWorkspace: boolean } {
  if (raw == null) {
    return {
      newOwnerUserId: "",
      deleteWorkspace: false
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const payload = raw as { newOwnerUserId?: unknown; deleteWorkspace?: unknown };
  return {
    newOwnerUserId: String(payload.newOwnerUserId ?? "").trim(),
    deleteWorkspace: payload.deleteWorkspace === true
  };
}

function createJoinToken(): string {
  return randomBytes(24).toString("hex");
}

function hashJoinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildJoinInvitePath(inviteToken: string): string {
  return `/?invite=${encodeURIComponent(inviteToken)}`;
}

function getJoinLinkState(link: WorkspaceJoinLinkDocument): WorkspaceJoinLinkDocument["status"] {
  if (link.status === "revoked" || link.status === "used") return link.status;
  const expiresAtMs = Date.parse(link.expiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    return "expired";
  }
  return "active";
}

function buildWorkspaceMemberPayload(
  membership: WorkspaceMembershipDocument,
  profilesByUserId: Map<string, UserProfileDocument>
): Record<string, unknown> {
  const profile = profilesByUserId.get(membership.userId);
  return {
    ...membership,
    displayName: profile?.displayName || undefined,
    photoUrl: profile?.photoUrl || undefined
  };
}

function logWorkspaceTelemetry(
  request: HttpRequest,
  context: InvocationContext,
  route: string,
  error: unknown,
  workspaceScope: "personal" | "workspace" | "unknown" = "workspace"
): void {
  const config = getConfig();
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
  if (status === 401 || status === 403 || status === 409 || status === 410) {
    logApiTelemetry({
      logger: context,
      level: "warn",
      request,
      config,
      route,
      workspaceScope,
      outcome: `http_${status}`
    });
  }
}

export async function workspacesCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const ownerUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspaces_create",
        workspaceScope: "personal"
      }
    });
    const payload = parseCreateWorkspaceBody(await request.json());
    const workspaceId = await createUniqueWorkspaceId(config);

    const created = await createWorkspaceWithOwner(config, {
      workspaceId,
      name: payload.name,
      ownerUserId
    });

    return jsonResponse(request, config, 201, {
      ok: true,
      workspace: created.workspace,
      membership: created.ownerMembership
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspaces_create", error, "personal");
    context.error("POST /workspaces failed", error);
    return errorResponse(request, config, error, "Failed to create workspace.");
  }
}

export async function workspacesMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspaces_me",
        workspaceScope: "personal"
      }
    });
    const rows = await listWorkspacesForUser(config, actorUserId);
    const workspaces = rows
      .map(({ workspace, membership }) => ({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        role: membership.role ?? "member",
        status: "active" as const
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return jsonResponse(request, config, 200, {
      workspaces
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspaces_me", error, "personal");
    context.error("GET /workspaces/me failed", error);
    return errorResponse(request, config, error, "Failed to list workspaces.");
  }
}

export async function workspaceMembersList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_members",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    const isMember = await hasWorkspaceMembership(config, actorUserId, workspaceId);
    if (!isMember) {
      throw new HttpError(403, "User is not a member of this workspace.");
    }

    const memberships = await listWorkspaceMemberships(config, workspaceId);
    const profiles = await listUserProfiles(
      config,
      memberships.map((membership) => membership.userId)
    );
    const profilesByUserId = new Map(
      profiles.map((profile) => [profile.userId, profile] as const)
    );
    return jsonResponse(request, config, 200, {
      workspaceId,
      count: memberships.length,
      memberships: memberships.map((membership) => buildWorkspaceMemberPayload(membership, profilesByUserId))
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_members", error);
    context.error("GET /workspaces/{workspaceId}/members failed", error);
    return errorResponse(request, config, error, "Failed to list workspace members.");
  }
}

export async function workspaceMembersAdd(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_members",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

    const payload = parseUpsertWorkspaceMemberBody(await request.json());
    const membership = await upsertWorkspaceMembership(config, {
      userId: payload.userId,
      workspaceId,
      role: payload.role,
      status: "active"
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      workspaceId,
      membership
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_members", error);
    context.error("POST /workspaces/{workspaceId}/members failed", error);
    return errorResponse(request, config, error, "Failed to add workspace member.");
  }
}

export async function workspaceMembers(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "OPTIONS") {
    return workspaceMembersList(request, context);
  }
  if (method === "POST") {
    return workspaceMembersAdd(request, context);
  }

  const config = getConfig();
  return jsonResponse(request, config, 405, {
    error: "Method not allowed."
  });
}

export async function workspaceMembersRemove(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_members_remove",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    const memberUserId = parseMemberUserIdFromParams(request);
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
    return jsonResponse(request, config, 200, {
      ok: true,
      workspaceId,
      memberUserId
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_members_remove", error);
    context.error("DELETE /workspaces/{workspaceId}/members/{memberUserId} failed", error);
    return errorResponse(request, config, error, "Failed to remove workspace member.");
  }
}

export async function workspaceLeave(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_leave",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    const actorMembership = await getWorkspaceMembership(config, actorUserId, workspaceId);
    if (!isActiveMembership(actorMembership)) {
      throw new HttpError(403, "User is not a member of this workspace.");
    }

    if (actorMembership.role !== "owner") {
      await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
      return jsonResponse(request, config, 200, {
        ok: true,
        workspaceId,
        leftWorkspace: true
      });
    }

    const payload = parseLeaveWorkspaceBody(await readRequestJson(request));
    const memberships = await listWorkspaceMemberships(config, workspaceId);
    const otherMembers = memberships.filter((membership) => membership.userId !== actorUserId);

    if (otherMembers.length === 0) {
      if (!payload.deleteWorkspace) {
        throw new HttpError(400, "Last workspace owner must confirm workspace deletion.");
      }
      await softDeleteWorkspace(config, workspaceId);
      await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
      return jsonResponse(request, config, 200, {
        ok: true,
        workspaceId,
        deletedWorkspace: true
      });
    }

    if (!payload.newOwnerUserId) {
      throw new HttpError(400, "Field 'newOwnerUserId' is required when other members remain.");
    }

    const targetMembership = otherMembers.find((membership) => membership.userId === payload.newOwnerUserId);
    if (!targetMembership) {
      throw new HttpError(400, "Selected new owner must already be an active workspace member.");
    }

    await upsertWorkspaceMembership(config, {
      userId: payload.newOwnerUserId,
      workspaceId,
      role: "owner",
      status: "active"
    });
    await deactivateWorkspaceMembership(config, actorUserId, workspaceId);
    await transferWorkspaceOwnership(config, workspaceId, payload.newOwnerUserId);

    return jsonResponse(request, config, 200, {
      ok: true,
      workspaceId,
      newOwnerUserId: payload.newOwnerUserId
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_leave", error);
    context.error("POST /workspaces/{workspaceId}/leave failed", error);
    return errorResponse(request, config, error, "Failed to leave workspace.");
  }
}

export async function workspaceJoinLinksList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_join_links",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

    const links = await listWorkspaceJoinLinks(config, workspaceId);
    return jsonResponse(request, config, 200, {
      workspaceId,
      links: links.map((link) => ({
        inviteId: link.inviteId,
        status: getJoinLinkState(link),
        expiresAt: link.expiresAt
      }))
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_join_links", error);
    context.error("GET /workspaces/{workspaceId}/join-links failed", error);
    return errorResponse(request, config, error, "Failed to list workspace join links.");
  }
}

export async function workspaceJoinLinksCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_join_links",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

    const workspace = await getWorkspaceById(config, workspaceId);
    if (!workspace || isWorkspaceDeleted(workspace)) {
      throw new HttpError(404, "Workspace was not found.");
    }

    const inviteToken = createJoinToken();
    const inviteId = randomBytes(12).toString("hex");
    const expiresAt = new Date(Date.now() + JOIN_LINK_TTL_MS).toISOString();
    await createWorkspaceJoinLink(config, {
      inviteId,
      workspaceId,
      createdByUserId: actorUserId,
      tokenHash: hashJoinToken(inviteToken),
      expiresAt
    });

    return jsonResponse(request, config, 201, {
      ok: true,
      inviteId,
      inviteUrl: buildJoinInvitePath(inviteToken),
      expiresAt
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_join_links", error);
    context.error("POST /workspaces/{workspaceId}/join-links failed", error);
    return errorResponse(request, config, error, "Failed to create workspace join link.");
  }
}

export async function workspaceJoinLinks(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "OPTIONS") {
    return workspaceJoinLinksList(request, context);
  }
  if (method === "POST") {
    return workspaceJoinLinksCreate(request, context);
  }

  const config = getConfig();
  return jsonResponse(request, config, 405, {
    error: "Method not allowed."
  });
}

export async function workspaceJoinLinksRemove(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_join_links_remove",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = parseWorkspaceIdFromParams(request);
    const inviteId = parseInviteIdFromParams(request);
    await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

    const revoked = await revokeWorkspaceJoinLink(config, inviteId);
    if (!revoked || revoked.workspaceId !== workspaceId) {
      throw new HttpError(404, "Workspace join link was not found.");
    }

    return jsonResponse(request, config, 200, {
      ok: true,
      inviteId,
      workspaceId
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "workspace_join_links_remove", error);
    context.error("DELETE /workspaces/{workspaceId}/join-links/{inviteId} failed", error);
    return errorResponse(request, config, error, "Failed to revoke workspace join link.");
  }
}

export async function joinAccept(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "join_accept",
        workspaceScope: "unknown"
      }
    });
    const payload = parseJoinAcceptBody(await request.json());
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
      return jsonResponse(request, config, 200, {
        ok: true,
        preview: true,
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.name
      });
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

    return jsonResponse(request, config, 200, {
      ok: true,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.name,
      membership
    });
  } catch (error) {
    logWorkspaceTelemetry(request, context, "join_accept", error, "unknown");
    context.error("POST /join/accept failed", error);
    return errorResponse(request, config, error, "Failed to accept workspace join link.");
  }
}

app.http("workspacesCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces",
  handler: workspacesCreate
});

app.http("workspacesMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/me",
  handler: workspacesMe
});

app.http("workspaceMembers", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/members",
  handler: workspaceMembers
});

app.http("workspaceMembersRemove", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/members/{memberUserId}",
  handler: workspaceMembersRemove
});

app.http("workspaceLeave", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/leave",
  handler: workspaceLeave
});

app.http("workspaceJoinLinks", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/join-links",
  handler: workspaceJoinLinks
});

app.http("workspaceJoinLinksRemove", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/join-links/{inviteId}",
  handler: workspaceJoinLinksRemove
});

app.http("joinAccept", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "join/accept",
  handler: joinAccept
});
