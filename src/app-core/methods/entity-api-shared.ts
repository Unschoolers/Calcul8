import type { AppContext } from "../context-app.ts";
import { hasAuthSignal } from "../auth/index.ts";
import { parseApiErrorMessage } from "../shared/api-error-message.ts";
import { getActiveWorkspaceId } from "../workspace-scope.ts";
import { fetchAuthenticatedApiResponse, resolveApiBaseUrl } from "./ui/common/shared.ts";

export class SalesLiveApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SalesLiveApiError";
    this.status = status;
  }
}

export type SalesLiveApiApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "getSalesStorageKey"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "notify"
>;

function isSignedInForEntityApis(): boolean {
  try {
    return Boolean(resolveApiBaseUrl() && hasAuthSignal());
  } catch {
    return false;
  }
}

export function getScopeQuery(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): string {
  const workspaceId = getActiveWorkspaceId(app);
  if (!workspaceId) return "";
  return `?workspaceId=${encodeURIComponent(workspaceId)}`;
}

export function getScopeBody(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): { workspaceId?: string } {
  const workspaceId = getActiveWorkspaceId(app);
  if (!workspaceId) {
    return {};
  }
  return {
    workspaceId
  };
}

export async function requestJson(
  app: Pick<AppContext, "googleAuthEpoch" | "hasProAccess" | "notify">,
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: {
    expireAuthOn401?: boolean;
  } = {}
): Promise<unknown> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    throw new SalesLiveApiError(0, "API base URL is not configured.");
  }

  const response = await fetchAuthenticatedApiResponse(app, path, init, options);

  if (response.status === 401) {
    throw new SalesLiveApiError(401, "Your sign-in expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new SalesLiveApiError(response.status, await parseApiErrorMessage(response, fallbackMessage));
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function canUseAuthoritativeSalesLiveApi(): boolean {
  return isSignedInForEntityApis();
}

export function createMutationId(prefix: string): string {
  const cryptoApi = window.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}:${cryptoApi.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
}
