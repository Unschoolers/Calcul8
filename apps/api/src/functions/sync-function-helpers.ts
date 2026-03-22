import type { HttpRequest, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { errorResponse } from "../lib/http";
import { assertSyncScopeAccess, resolveSyncScope, shouldWarnWorkspaceScopeFallback, type ResolvedSyncScope } from "../lib/syncScopeResolution";
import { logApiTelemetry } from "../lib/telemetry";
import type { ApiConfig } from "../types";

export interface AuthorizedSyncScopeResult {
  userId: string;
  syncScope: ResolvedSyncScope;
}

interface ResolveAuthorizedSyncScopeInput {
  request: HttpRequest;
  context: InvocationContext;
  config: ApiConfig;
  route: "sync_pull" | "sync_push";
  workspaceId?: string;
}

interface HandleSyncFunctionErrorInput {
  request: HttpRequest;
  context: InvocationContext;
  config: ApiConfig;
  route: "sync_pull" | "sync_push";
  workspaceId?: string;
  error: unknown;
  failureMessage: string;
  logMessage: string;
}

export async function resolveAuthorizedSyncScope(
  input: ResolveAuthorizedSyncScopeInput
): Promise<AuthorizedSyncScopeResult> {
  const userId = await resolveUserId(input.request, input.config, {
    telemetry: {
      logger: input.context,
      route: input.route,
      workspaceScope: "unknown"
    }
  });
  const syncScope = resolveSyncScope(userId, input.workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (actorUserId, workspaceId) => hasWorkspaceMembership(input.config, actorUserId, workspaceId)
  );

  if (shouldWarnWorkspaceScopeFallback(syncScope)) {
    input.context.warn("workspaceId provided but workspace sync scope is not enabled yet; using personal scope.", {
      userId,
      workspaceId: input.workspaceId,
      partitionKey: syncScope.partitionKey
    });
  }

  return { userId, syncScope };
}

export function handleSyncFunctionError(input: HandleSyncFunctionErrorInput) {
  const status = typeof input.error === "object" && input.error && "status" in input.error
    ? Number((input.error as { status?: unknown }).status)
    : null;

  if (status === 401 || status === 403 || status === 409) {
    logApiTelemetry({
      logger: input.context,
      level: "warn",
      request: input.request,
      config: input.config,
      route: input.route,
      workspaceScope: input.workspaceId ? "workspace" : "personal",
      outcome: `http_${status}`
    });
  }

  input.context.error(input.logMessage, input.error);
  return errorResponse(input.request, input.config, input.error, input.failureMessage);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readHttpErrorStatus(error: unknown): number | null {
  if (!(error instanceof HttpError)) {
    return typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status)
      : null;
  }

  return error.status;
}
