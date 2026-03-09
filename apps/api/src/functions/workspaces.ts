import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import {
  createWorkspaceWithOwner,
  deactivateWorkspaceMembership,
  getWorkspaceById,
  getWorkspaceMembership,
  hasWorkspaceMembership,
  listWorkspaceMemberships,
  upsertWorkspaceMembership
} from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import type { WorkspaceMembershipDocument, WorkspaceRole } from "../types";

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

function canManageWorkspaceMembership(membership: WorkspaceMembershipDocument | null): boolean {
  if (!membership) return false;
  if (membership.status === "disabled" || membership.status === "removed") return false;
  return membership.role === "owner" || membership.role === "admin";
}

async function assertCanManageWorkspaceMembership(
  config: ReturnType<typeof getConfig>,
  actorUserId: string,
  workspaceId: string
): Promise<void> {
  const actorMembership = await getWorkspaceMembership(config, actorUserId, workspaceId);
  if (!canManageWorkspaceMembership(actorMembership)) {
    throw new HttpError(403, "Only workspace owner/admin can manage members.");
  }
}

function normalizeWorkspaceRole(rawRole: unknown): WorkspaceRole {
  const role = String(rawRole ?? "member").trim().toLowerCase();
  if (role === "owner" || role === "admin" || role === "member") {
    return role;
  }
  throw new HttpError(400, "Field 'role' must be one of: owner, admin, member.");
}

function parseCreateWorkspaceBody(raw: unknown): { workspaceId: string; name: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const payload = raw as { workspaceId?: unknown; name?: unknown };
  const workspaceId = String(payload.workspaceId ?? "").trim();
  const name = String(payload.name ?? "").trim();

  if (!workspaceId) {
    throw new HttpError(400, "Field 'workspaceId' is required.");
  }
  if (!name) {
    throw new HttpError(400, "Field 'name' is required.");
  }

  return { workspaceId, name };
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

export async function workspacesCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const ownerUserId = await resolveUserId(request, config);
    const payload = parseCreateWorkspaceBody(await request.json());
    const existing = await getWorkspaceById(config, payload.workspaceId);
    if (existing) {
      throw new HttpError(409, "Workspace already exists.");
    }

    const created = await createWorkspaceWithOwner(config, {
      workspaceId: payload.workspaceId,
      name: payload.name,
      ownerUserId
    });

    return jsonResponse(request, config, 201, {
      ok: true,
      workspace: created?.workspace ?? {
        workspaceId: payload.workspaceId,
        name: payload.name,
        ownerUserId
      },
      membership: created?.ownerMembership ?? null
    });
  } catch (error) {
    context.error("POST /workspaces failed", error);
    return errorResponse(request, config, error, "Failed to create workspace.");
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
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = parseWorkspaceIdFromParams(request);
    const isMember = await hasWorkspaceMembership(config, actorUserId, workspaceId);
    if (!isMember) {
      throw new HttpError(403, "User is not a member of this workspace.");
    }

    const memberships = await listWorkspaceMemberships(config, workspaceId);
    return jsonResponse(request, config, 200, {
      workspaceId,
      count: memberships.length,
      memberships
    });
  } catch (error) {
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
    const actorUserId = await resolveUserId(request, config);
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
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = parseWorkspaceIdFromParams(request);
    const memberUserId = parseMemberUserIdFromParams(request);
    await assertCanManageWorkspaceMembership(config, actorUserId, workspaceId);

    const targetMembership = await getWorkspaceMembership(config, memberUserId, workspaceId);
    if (!targetMembership) {
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
    context.error("DELETE /workspaces/{workspaceId}/members/{memberUserId} failed", error);
    return errorResponse(request, config, error, "Failed to remove workspace member.");
  }
}

app.http("workspacesCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces",
  handler: workspacesCreate
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
