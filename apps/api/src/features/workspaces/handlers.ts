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
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { logApiTelemetry } from "../../lib/telemetry";
import { parseRequiredWorkspaceId } from "../../lib/syncScope";
import type {
  ApiConfig,
  WorkspaceJoinLinkDocument,
} from "../../types";
import {
  assertCanManageWorkspaceMembership,
  isActiveMembership,
  parseCreateWorkspaceBody,
  parseJoinAcceptBody,
  parseLeaveWorkspaceBody,
  parseUpsertWorkspaceMemberBody,
  hashJoinToken
} from "./helpers";
import {
  buildWorkspaceCreationFingerprint,
  buildWorkspaceCreationKeyHash,
  deriveWorkspaceCreationId
} from "./creationIdentity";
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
  config: ApiConfig,
  route: string,
  error: unknown,
  workspaceScope: "personal" | "workspace" | "unknown" = "workspace"
): void {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
  const errorCode = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "").trim().toLowerCase()
    : "";
  if (status === 401 || status === 403 || status === 409 || status === 410) {
    logApiTelemetry({
      logger: context,
      level: "warn",
      request,
      config,
      route,
      workspaceScope,
      outcome: errorCode || `http_${status}`
    });
  }
}

function normalizeWorkspaceCreationError(error: unknown): unknown {
  return error instanceof Error && error.name === "WorkspaceCreationConflictError"
    ? new HttpError(409, error.message, "IDEMPOTENCY_MISMATCH")
    : error instanceof Error && error.name === "WorkspaceCreationInProgressError"
      ? new HttpError(409, error.message, "OPERATION_IN_PROGRESS")
      : error;
}

export async function workspacesCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /workspaces failed",
    fallbackErrorMessage: "Failed to create workspace.",
    mapError: normalizeWorkspaceCreationError,
    operation: async ({ config }) => {
    const ownerUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspaces_create",
        workspaceScope: "personal"
      }
    });
    const payload = parseCreateWorkspaceBody(await request.json());
    const workspaceId = deriveWorkspaceCreationId(ownerUserId, payload.idempotencyKey);

    const created = await createWorkspaceWithOwner(config, {
      workspaceId,
      name: payload.name,
      ownerUserId,
      creationKeyHash: buildWorkspaceCreationKeyHash(payload.idempotencyKey),
      creationFingerprint: buildWorkspaceCreationFingerprint(ownerUserId, payload.name)
    });

    return jsonResponse(request, config, 201, {
      ok: true,
      workspace: created.workspace,
      membership: created.ownerMembership
    });
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspaces_create", error, "personal")
  });
}

export async function workspacesMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /workspaces/me failed",
    fallbackErrorMessage: "Failed to list workspaces.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspaces_me", error, "personal")
  });
}

export async function workspaceMembersList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /workspaces/{workspaceId}/members failed",
    fallbackErrorMessage: "Failed to list workspace members.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_members", error)
  });
}

export async function workspaceMembersAdd(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /workspaces/{workspaceId}/members failed",
    fallbackErrorMessage: "Failed to add workspace member.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_members", error)
  });
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
  return executeHttpHandler(request, context, {
    errorLogMessage: "DELETE /workspaces/{workspaceId}/members/{memberUserId} failed",
    fallbackErrorMessage: "Failed to remove workspace member.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_members_remove", error)
  });
}

export async function workspaceLeave(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /workspaces/{workspaceId}/leave failed",
    fallbackErrorMessage: "Failed to leave workspace.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_leave", error)
  });
}

export async function workspaceJoinLinksList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /workspaces/{workspaceId}/join-links failed",
    fallbackErrorMessage: "Failed to list workspace join links.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_join_links", error)
  });
}

export async function workspaceJoinLinksCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /workspaces/{workspaceId}/join-links failed",
    fallbackErrorMessage: "Failed to create workspace join link.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_join_links", error)
  });
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
  return executeHttpHandler(request, context, {
    errorLogMessage: "DELETE /workspaces/{workspaceId}/join-links/{inviteId} failed",
    fallbackErrorMessage: "Failed to revoke workspace join link.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "workspace_join_links_remove", error)
  });
}

export async function joinAccept(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /join/accept failed",
    fallbackErrorMessage: "Failed to accept workspace join link.",
    operation: async ({ config }) => {
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
    },
    onError: (error, { config }) => logWorkspaceTelemetry(request, context, config, "join_accept", error, "unknown")
  });
}
