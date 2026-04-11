import type { HttpRequest, InvocationContext } from "@azure/functions";
import { resolveUserId } from "../lib/auth";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { assertSyncScopeAccess, resolveSyncScope, shouldWarnWorkspaceScopeFallback, type ResolvedSyncScope } from "../lib/syncScopeResolution";
import type { ApiConfig } from "../types";
import { handleApiFunctionError, readHttpErrorStatus as readSharedHttpErrorStatus } from "./function-error-helpers";

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
  return handleApiFunctionError({
    request: input.request,
    context: input.context,
    config: input.config,
    route: input.route,
    workspaceScope: input.workspaceId ? "workspace" : "personal",
    error: input.error,
    failureMessage: input.failureMessage,
    logMessage: input.logMessage
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readHttpErrorStatus(error: unknown): number | null {
  return readSharedHttpErrorStatus(error);
}
