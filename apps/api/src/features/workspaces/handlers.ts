import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { listUserProfiles } from "../../lib/cosmos/entitlementRepository";
import { getConfig } from "../../lib/config";
import {
  createWorkspaceWithOwner,
  getWorkspaceById,
  getWorkspaceMembership,
  hasWorkspaceMembership,
  listWorkspacesForUser,
  upsertWorkspaceMembership
} from "../../lib/cosmos/workspaceRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import { logApiTelemetry } from "../../lib/telemetry";
import { parseRequiredWorkspaceId } from "../../lib/syncScope";
import type {
  WorkspaceJoinLinkDocument,
} from "../../types";
import {
  assertCanManageWorkspaceMembership,
  createUniqueWorkspaceId,
  isActiveMembership,
  isWorkspaceDeleted,
  parseCreateWorkspaceBody,
  parseJoinAcceptBody,
  parseLeaveWorkspaceBody,
  parseUpsertWorkspaceMemberBody,
  hashJoinToken
} from "./helpers";
import { readRequestJsonOrNull, requireRouteParam } from "../../lib/httpRequest";
import {
  addWorkspaceMemberForActor,
  listWorkspaceMembersForActor,
  removeWorkspaceMemberForActor
} from "./membersService";
import {
  createWorkspaceJoinLinkForActor,
  listWorkspaceJoinLinksForActor,
  revokeWorkspaceJoinLinkForActor
} from "./joinLinksService";
import { leaveWorkspaceForActor } from "./leaveService";
import { acceptWorkspaceJoinLinkForActor } from "./joinAcceptService";

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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const responseBody = await listWorkspaceMembersForActor(config, actorUserId, workspaceId);
    return jsonResponse(request, config, 200, responseBody);
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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const payload = parseUpsertWorkspaceMemberBody(await request.json());
    const result = await addWorkspaceMemberForActor(config, actorUserId, workspaceId, payload);

    return jsonResponse(request, config, 200, {
      ok: true,
      workspaceId: result.workspaceId,
      membership: result.membership
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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const memberUserId = requireRouteParam(request, "memberUserId");
    const result = await removeWorkspaceMemberForActor(config, actorUserId, workspaceId, memberUserId);
    return jsonResponse(request, config, 200, {
      ok: true,
      workspaceId: result.workspaceId,
      memberUserId: result.memberUserId
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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const payload = parseLeaveWorkspaceBody(await readRequestJsonOrNull(request));
    const result = await leaveWorkspaceForActor(config, actorUserId, workspaceId, payload);

    return jsonResponse(request, config, 200, {
      ok: true,
      ...result
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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const responseBody = await listWorkspaceJoinLinksForActor(config, actorUserId, workspaceId);
    return jsonResponse(request, config, 200, responseBody);
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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const result = await createWorkspaceJoinLinkForActor(config, actorUserId, workspaceId);

    return jsonResponse(request, config, 201, {
      ok: true,
      inviteId: result.inviteId,
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt
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
    const workspaceId = parseRequiredWorkspaceId(requireRouteParam(request, "workspaceId"));
    const inviteId = requireRouteParam(request, "inviteId");
    const result = await revokeWorkspaceJoinLinkForActor(config, actorUserId, workspaceId, inviteId);

    return jsonResponse(request, config, 200, {
      ok: true,
      inviteId: result.inviteId,
      workspaceId: result.workspaceId
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
    const responseBody = await acceptWorkspaceJoinLinkForActor(config, actorUserId, payload);
    return jsonResponse(request, config, 200, responseBody);
  } catch (error) {
    logWorkspaceTelemetry(request, context, "join_accept", error, "unknown");
    context.error("POST /join/accept failed", error);
    return errorResponse(request, config, error, "Failed to accept workspace join link.");
  }
}
