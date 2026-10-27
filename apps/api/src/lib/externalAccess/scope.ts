import { HttpError } from "../auth";
import {
  assertSyncScopeAccess,
  resolveSyncScope,
  type ResolvedSyncScope
} from "../syncScopeResolution";
import type {
  ExternalPrincipal,
  ExternalPrincipalAuthority,
  ExternalResolvedScope,
  ExternalScopeResolver,
  RevalidateExternalAccessInput,
  RevalidateExternalPrincipalInput,
  ResolveExternalScopeInput
} from "./contracts";
import { ExternalError, type ExternalErrorCode } from "./errors";

type ExternalScopeDependencies = ExternalPrincipalAuthority & {
  hasWorkspaceMembership: (actorUserId: string, workspaceId: string) => Promise<boolean>;
};

function statusOf(error: unknown): unknown {
  return error !== null && typeof error === "object"
    ? (error as { status?: unknown }).status
    : undefined;
}

function mapKnownHttpError(error: unknown): ExternalError | undefined {
  if (!(error instanceof HttpError) && statusOf(error) === undefined) return undefined;

  switch (statusOf(error)) {
    case 400:
      return new ExternalError("invalid_request");
    case 401:
      return new ExternalError("authentication_required");
    case 403:
      return new ExternalError("forbidden");
    default:
      return undefined;
  }
}

function asBoundaryError(error: unknown, fallback: ExternalErrorCode): ExternalError {
  if (error instanceof ExternalError) return error;
  return mapKnownHttpError(error) ?? new ExternalError(fallback);
}

function assertPrincipal(authority: ExternalPrincipalAuthority, principal: ExternalPrincipal): void {
  try {
    authority.assertExternalPrincipal(principal);
  } catch (error) {
    throw asBoundaryError(error, "invalid_token");
  }
}

function freezeResolvedScope(scope: ResolvedSyncScope): ExternalResolvedScope {
  return Object.freeze({
    actorUserId: scope.actorUserId,
    requestedWorkspaceId: scope.requestedWorkspaceId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    partitionKey: scope.partitionKey,
    workspaceScopeEnabled: scope.workspaceScopeEnabled
  });
}

function isPrincipal(value: unknown): value is ExternalPrincipal {
  return value !== null && typeof value === "object";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function createExternalScopeService(dependencies: ExternalScopeDependencies): {
  readonly resolveExternalScope: ExternalScopeResolver;
  readonly revalidateExternalAccess: (input: RevalidateExternalAccessInput) => Promise<void>;
} {
  if (!dependencies
    || typeof dependencies.assertExternalPrincipal !== "function"
    || typeof dependencies.revalidateExternalPrincipal !== "function"
    || typeof dependencies.hasWorkspaceMembership !== "function") {
    throw new TypeError("External scope authorization dependencies are required.");
  }

  const issuedScopes = new WeakMap<ExternalResolvedScope, ExternalPrincipal>();

  const resolveExternalScope: ExternalScopeResolver = async (
    input: ResolveExternalScopeInput
  ): Promise<ExternalResolvedScope> => {
    if (!isObject(input) || !isPrincipal(input.principal)) {
      throw new ExternalError("authentication_required");
    }

    const principal = input.principal;
    assertPrincipal(dependencies, principal);

    let resolved: ResolvedSyncScope;
    try {
      resolved = resolveSyncScope(principal.userId, input.workspaceId);
    } catch (error) {
      throw asBoundaryError(error, "invalid_request");
    }

    if (resolved.scopeType === "workspace") {
      try {
        await assertSyncScopeAccess(resolved, dependencies.hasWorkspaceMembership);
      } catch (error) {
        throw asBoundaryError(error, "temporarily_unavailable");
      }

      // Membership checks may await storage, so reject principals that expired while they ran.
      assertPrincipal(dependencies, principal);
    }

    const scope = freezeResolvedScope(resolved);
    issuedScopes.set(scope, principal);
    return scope;
  };

  const revalidateExternalAccess = async (
    input: RevalidateExternalAccessInput
  ): Promise<void> => {
    if (!isObject(input) || !isPrincipal(input.principal) || !isObject(input.scope)) {
      throw new ExternalError("invalid_token");
    }

    const { principal, scope, expectedResource, requiredScopes } = input;
    if (issuedScopes.get(scope) !== principal) {
      throw new ExternalError("invalid_token");
    }

    const revalidation: RevalidateExternalPrincipalInput = {
      principal,
      expectedResource,
      requiredScopes
    };
    try {
      await dependencies.revalidateExternalPrincipal(revalidation);
    } catch (error) {
      throw asBoundaryError(error, "temporarily_unavailable");
    }

    if (scope.scopeType === "workspace") {
      try {
        await assertSyncScopeAccess(scope, dependencies.hasWorkspaceMembership);
      } catch (error) {
        throw asBoundaryError(error, "temporarily_unavailable");
      }
    }

    assertPrincipal(dependencies, principal);
  };

  return Object.freeze({ resolveExternalScope, revalidateExternalAccess });
}
