import type {
  WhatnotConnectionContext,
  WhatnotHttpContext,
  WhatnotScopeContext
} from "../../../context/whatnot.ts";
import { normalizeApiErrorEnvelope } from "../../../shared/api-error-message.ts";
import { fetchAuthenticatedApiResponse, handleExpiredAuth, isApiRequestAborted, resolveApiBaseUrl } from "../common/shared.ts";

export function canManageWhatnot(
  app: Pick<WhatnotConnectionContext, "activeScopeType" | "isCurrentWorkspaceOwner">
): boolean {
  return app.activeScopeType === "personal" || app.isCurrentWorkspaceOwner;
}

export function buildWhatnotScopeBody(app: WhatnotScopeContext): Record<string, string> {
  return {
    ...(app.activeScopeType === "workspace" && app.activeWorkspaceId
      ? { workspaceId: app.activeWorkspaceId }
      : {}),
    appReturnUrl: window.location.origin
  };
}

export async function fetchWhatnotJson(
  app: WhatnotHttpContext,
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: {
    expireAuthOn401?: boolean;
    retryUnsafeMethods?: boolean;
    errorMessagesByCode?: Readonly<Record<string, string>>;
  } = {}
): Promise<{ ok: true; body: unknown } | { ok: false; aborted: true } | { ok: false }> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Whatnot integration is unavailable until the API base URL is configured.", "warning");
    return { ok: false };
  }

  let response: Response;
  try {
    response = await fetchAuthenticatedApiResponse(app, path, init, options);
  } catch (error) {
    if (isApiRequestAborted(error)) return { ok: false, aborted: true };
    throw error;
  }

  if (response.status === 401) {
    if (options.expireAuthOn401 !== false) {
      handleExpiredAuth(app);
    }
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return { ok: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    if (isApiRequestAborted(error)) return { ok: false, aborted: true };
    body = null;
  }

  if (!response.ok) {
    const errorBody = normalizeApiErrorEnvelope(body, response.status, fallbackMessage);
    const errorCode = errorBody.code;
    const message = String(
      (errorCode ? options.errorMessagesByCode?.[errorCode] : undefined)
      ?? errorBody.message
    ).trim() || fallbackMessage;
    app.notify(message, "error");
    return { ok: false };
  }

  return { ok: true, body };
}
